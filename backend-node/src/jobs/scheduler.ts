import type { Db } from '../db/client.js';
import type { Logger } from '../lib/log.js';

// 서버 프로세스 안의 스케줄러 — 외부 크론 없이 하루 한 번 돈다
// 근거: docs/architecture/backend.md 07절 4. 배치 작업

const HOUR = 60 * 60 * 1000;
// 한국 표준시는 UTC+9이고 일광 절약 시간이 없다
const KST_OFFSET = 9 * HOUR;

// 지금 이후 가장 가까운 "KST hour시 정각"
export function nextRunAt(now: Date, hourKst: number): Date {
  const kst = new Date(now.getTime() + KST_OFFSET);
  const run = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hourKst) - KST_OFFSET;
  return new Date(run > now.getTime() ? run : run + 24 * HOUR);
}

export interface DailyJob {
  name: string;
  hourKst: number;
  // 잠금 번호 — 작업마다 다르게
  lockKey: number;
  run: () => Promise<Record<string, unknown>>;
}

// 인스턴스가 둘이거나 재시작이 겹쳐도 한 번만 돌게 잠금을 잡고 실행한다
// 잠금은 트랜잭션이 끝날 때 풀린다. 작업 자체는 다른 연결로 돈다
// catchUpAt을 주면 놓친 실행을 따라잡는 것이다 — 잠금을 잡은 뒤에 정말 놓쳤는지 다시 본다
// 두 인스턴스가 함께 켜지면 둘 다 "놓쳤다"고 읽는다. 잠금은 겹침만 막고 잇달아 도는 것은 막지 못한다
export async function runLocked(db: Db, log: Logger, job: DailyJob, catchUpAt?: Date): Promise<boolean> {
  const started = Date.now();
  try {
    return await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${job.lockKey}) AS locked`;
        if (rows[0]?.locked !== true) {
          log.info('job', { job: job.name, skipped: 'locked' });
          return false;
        }
        if (catchUpAt !== undefined && !(await missedRun(tx, job, catchUpAt))) {
          log.info('job', { job: job.name, skipped: 'already-ran' });
          return false;
        }
        const result = await job.run();
        // 끝난 시각을 남긴다 — 다음에 켜질 때 놓친 실행이 있는지 이것으로 안다
        const ranAt = new Date();
        await tx.jobRun.upsert({ where: { name: job.name }, create: { name: job.name, ranAt }, update: { ranAt } });
        log.info('job', { job: job.name, ...result, ms: Date.now() - started });
        return true;
      },
      { timeout: 5 * 60 * 1000, maxWait: 10_000 },
    );
  } catch (err) {
    // 배치가 실패해도 서버는 계속 돈다. 다음 날 다시 시도한다
    log.error('job', { job: job.name, failed: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
    return false;
  }
}

// 가장 최근의 예정 시각 뒤로 돈 적이 없으면 놓친 것이다
// 쓰지 않으면 꺼지는 호스트에서는 예정 시각에 서버가 없을 수 있다 — 켜질 때 한 번 따라잡는다
export async function missedRun(db: Pick<Db, 'jobRun'>, job: DailyJob, now: Date): Promise<boolean> {
  const lastDue = new Date(nextRunAt(now, job.hourKst).getTime() - 24 * HOUR);
  const last = await db.jobRun.findUnique({ where: { name: job.name } });
  return last === null || last.ranAt.getTime() < lastDue.getTime();
}

export function startDaily(db: Db, log: Logger, job: DailyJob, now: () => Date = () => new Date()) {
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    const at = nextRunAt(now(), job.hourKst);
    // setTimeout의 상한(약 24.8일)보다 항상 짧다 — 최대 24시간
    timer = setTimeout(() => {
      void runLocked(db, log, job).finally(arm);
    }, at.getTime() - now().getTime());
    // 이 타이머 때문에 프로세스가 종료를 미루지 않게 한다
    timer.unref();
  };
  arm();
  // 켜질 때 놓친 실행을 따라잡는다. 실패해도 서버는 계속 뜨고 다음 예정 시각에 다시 돈다
  const caughtUp = missedRun(db, job, now())
    .then((missed) => (missed ? runLocked(db, log, job, now()) : false))
    .catch((err: unknown) => {
      log.error('job', { job: job.name, failed: err instanceof Error ? err.message : String(err) });
      return false;
    });
  return { stop: () => clearTimeout(timer), caughtUp };
}

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
export async function runLocked(db: Db, log: Logger, job: DailyJob): Promise<boolean> {
  const started = Date.now();
  try {
    return await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${job.lockKey}) AS locked`;
        if (rows[0]?.locked !== true) {
          log.info('job', { job: job.name, skipped: 'locked' });
          return false;
        }
        const result = await job.run();
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
  return { stop: () => clearTimeout(timer) };
}

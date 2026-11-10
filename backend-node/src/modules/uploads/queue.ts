import { AppError } from '../../errors/AppError.js';

// 이미지 처리는 CPU를 많이 쓴다 — 동시에 도는 수를 제한해 다른 요청이 느려지지 않게 한다
// 대기열이 가득 차면 429로 돌려보낸다 (backend.md 07절 2)
export function createWorkQueue(concurrency: number, maxWaiting: number) {
  let running = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(work: () => Promise<T>): Promise<T> {
    if (running >= concurrency) {
      if (waiting.length >= maxWaiting) throw new AppError('RATE_LIMITED');
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      running += 1;
    }
    try {
      return await work();
    } finally {
      // 자리를 다음 대기자에게 그대로 넘긴다
      const next = waiting.shift();
      if (next === undefined) running -= 1;
      else next();
    }
  };
}

export type WorkQueue = ReturnType<typeof createWorkQueue>;

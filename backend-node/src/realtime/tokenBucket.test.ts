import { describe, expect, it } from 'vitest';
import { createTokenBucket } from './tokenBucket.js';

describe('토큰 버킷', () => {
  it('[AC-CH-33] 한꺼번에 10개까지 받고, 그다음은 기다릴 시간을 알려 준다', () => {
    const bucket = createTokenBucket(10, 5);
    for (let i = 0; i < 10; i += 1) expect(bucket.take('u', 1000)).toBe(0);
    // 초당 5개 충전 = 토큰 하나에 200ms
    expect(bucket.take('u', 1000)).toBe(200);
    expect(bucket.take('u', 1100)).toBe(100);
    expect(bucket.take('u', 1200)).toBe(0);
    expect(bucket.take('u', 1200)).toBe(200);
  });

  it('[T-03] 200ms 간격의 재전송은 몇 개를 보내도 막히지 않는다', () => {
    const bucket = createTokenBucket(10, 5);
    for (let i = 0; i < 100; i += 1) expect(bucket.take('u', i * 200)).toBe(0);
  });

  it('쉬면 다시 차되 용량을 넘지 않는다', () => {
    const bucket = createTokenBucket(10, 5);
    for (let i = 0; i < 10; i += 1) bucket.take('u', 0);
    // 한 시간 뒤에도 10개까지만
    for (let i = 0; i < 10; i += 1) expect(bucket.take('u', 3_600_000)).toBe(0);
    expect(bucket.take('u', 3_600_000)).toBeGreaterThan(0);
  });

  it('사용자마다 따로 세고, 거절된 시도는 토큰을 쓰지 않는다', () => {
    const bucket = createTokenBucket(2, 1);
    expect([bucket.take('a', 0), bucket.take('a', 0), bucket.take('a', 0)]).toEqual([0, 0, 1000]);
    expect(bucket.take('b', 0)).toBe(0);
    // 계속 두드려도 기다릴 시간이 늘지 않는다
    for (let i = 0; i < 50; i += 1) bucket.take('a', 500);
    expect(bucket.take('a', 1000)).toBe(0);
  });

  it('시계가 뒤로 가도 토큰이 줄지 않는다', () => {
    const bucket = createTokenBucket(2, 1);
    bucket.take('a', 10_000);
    expect(bucket.take('a', 5_000)).toBe(0);
  });
});

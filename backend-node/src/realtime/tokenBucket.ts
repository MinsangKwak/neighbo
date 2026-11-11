// 토큰 버킷 — 짧은 몰림은 용량만큼 받고, 지속 속도만 막는다 [AC-CH-33]
// "초당 N개 넘으면 차단"은 끊긴 동안 쌓인 메시지를 재연결 순간 한꺼번에 보내는 정상 사용자를 막았다 (T-03)
// 저장소는 프로세스 메모리 — 인스턴스가 늘면 Redis로 옮긴다 (결정 0005)
export function createTokenBucket(capacity: number, refillPerSecond: number) {
  const buckets = new Map<string, { tokens: number; at: number }>();

  return {
    // 토큰 하나를 쓴다. 0이면 통과, 양수면 그만큼(ms) 기다려야 한다
    take(key: string, now: number): number {
      // 가득 찬 채 쉬고 있는 버킷은 지워도 결과가 같다 — 키가 끝없이 쌓이지 않게 한다
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) {
          if (b.tokens + ((now - b.at) / 1000) * refillPerSecond >= capacity) buckets.delete(k);
        }
      }
      const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
      // 시계가 뒤로 가도 토큰이 줄지 않게 한다
      const elapsed = Math.max(0, now - bucket.at);
      const tokens = Math.min(capacity, bucket.tokens + (elapsed / 1000) * refillPerSecond);
      if (tokens < 1) {
        buckets.set(key, { tokens, at: now });
        return Math.ceil(((1 - tokens) / refillPerSecond) * 1000);
      }
      buckets.set(key, { tokens: tokens - 1, at: now });
      return 0;
    },
  };
}

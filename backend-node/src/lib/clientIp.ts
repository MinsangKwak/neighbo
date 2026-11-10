import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

// HTTP는 프록시를 거치므로 백엔드가 보는 IP는 프록시의 IP다 (T-02)
// 프록시가 공유 비밀과 함께 넘긴 X-Client-IP만 믿고, 아니면 한 홉만 믿는 req.ip를 쓴다
export function createClientIp(proxySecret: string) {
  const expected = Buffer.from(proxySecret);
  return (req: Request): string => {
    const secret = Buffer.from(req.get('X-Proxy-Secret') ?? '');
    const forwarded = req.get('X-Client-IP');
    if (
      forwarded !== undefined &&
      forwarded !== '' &&
      secret.length === expected.length &&
      timingSafeEqual(secret, expected)
    ) {
      return forwarded;
    }
    return req.ip ?? 'unknown';
  };
}

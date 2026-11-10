import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError.js';

// 고정 창 카운터. 저장소는 프로세스 메모리 — 인스턴스가 늘면 이 인터페이스 뒤를 Redis로 바꾼다 (결정 0005)
export interface RateLimitStore {
  // 창 안의 횟수를 1 올리고, 올린 뒤의 횟수와 창이 끝나는 시각을 돌려준다
  hit(key: string, windowMs: number, now: number): { count: number; resetAt: number };
}

export function createMemoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, windowMs, now) {
      const current = windows.get(key);
      if (current === undefined || current.resetAt <= now) {
        // 끝난 창을 지워 키가 끝없이 쌓이지 않게 한다
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        }
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      current.count += 1;
      return current;
    },
  };
}

interface RateLimitOptions {
  store: RateLimitStore;
  name: string;
  limit: number;
  windowMs: number;
  // 무엇을 기준으로 셀지 — IP(req) 또는 인증 미들웨어가 채운 사용자(res.locals)
  key: (req: Request, res: Response) => string;
}

// 한도를 넘으면 429 RATE_LIMITED + Retry-After(초) [AC-CM-32]
export function rateLimit({ store, name, limit, windowMs, key }: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const { count, resetAt } = store.hit(`${name}:${key(req, res)}`, windowMs, now);
    if (count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
      next(new AppError('RATE_LIMITED'));
      return;
    }
    next();
  };
}

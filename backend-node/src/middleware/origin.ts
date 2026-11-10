import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// HTTP와 소켓이 같은 함수로 판단한다 [AC-CM-31]
export function createOriginCheck(allowedOrigin: string, pattern: string | undefined) {
  const regex = pattern === undefined ? null : new RegExp(pattern);
  return (origin: string | undefined): boolean => {
    if (origin === undefined) return false;
    return origin === allowedOrigin || (regex !== null && regex.test(origin));
  };
}

// 쿠키 인증이라 쓰기 요청은 Origin이 허용 목록 안일 때만 받는다
// Origin이 없는 쓰기 요청도 거절한다 — 프록시가 브라우저의 Origin을 항상 복사해 넘긴다
export function originGuard(isAllowed: (origin: string | undefined) => boolean): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || isAllowed(req.get('Origin'))) {
      next();
      return;
    }
    next(new AppError('ORIGIN_MISMATCH'));
  };
}

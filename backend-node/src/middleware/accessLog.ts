import type { RequestHandler } from 'express';
import type { Logger } from '../lib/log.js';

// 응답마다 한 줄. route는 실제 경로가 아니라 패턴으로 남긴다 — ID가 흩어지지 않게
export function accessLog(log: Logger): RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const pattern: unknown = req.route?.path;
      // 오류로 끝난 요청은 이 시점에 req.baseUrl이 비어 있어, 라우터를 붙일 때 적어 둔 경로를 쓴다
      const mount = typeof res.locals.mount === 'string' ? res.locals.mount : '';
      const route = typeof pattern === 'string' ? `${mount}${pattern === '/' && mount !== '' ? '' : pattern}` : '(unmatched)';
      const code: unknown = res.locals.errorCode;
      log.info('http', {
        reqId: res.locals.requestId,
        method: req.method,
        route,
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
        ...(typeof code === 'string' ? { code } : {}),
      });
    });
    next();
  };
}

// 라우터를 붙인 경로를 기록해 둔다 — 접근 로그의 route 패턴에 쓴다
export function mountedAt(path: string): RequestHandler {
  return (_req, res, next) => {
    res.locals.mount = path;
    next();
  };
}

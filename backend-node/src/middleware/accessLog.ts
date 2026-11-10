import type { RequestHandler } from 'express';
import type { Logger } from '../lib/log.js';

// 응답마다 한 줄. route는 실제 경로가 아니라 패턴으로 남긴다 — ID가 흩어지지 않게
export function accessLog(log: Logger): RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const pattern: unknown = req.route?.path;
      const route = typeof pattern === 'string' ? `${req.baseUrl}${pattern}` : '(unmatched)';
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

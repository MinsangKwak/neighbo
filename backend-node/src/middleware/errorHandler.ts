import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ErrorResponse } from '@neighbo/shared-schema';
import { AppError } from '../errors/AppError.js';
import type { Logger } from '../lib/log.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND'));
};

// body-parser가 던지는 오류를 카탈로그 코드로 옮긴다
function fromBodyParser(err: unknown): AppError | null {
  if (typeof err !== 'object' || err === null || !('type' in err)) return null;
  if (err.type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  if (err.type === 'entity.parse.failed') return new AppError('VALIDATION_FAILED');
  return null;
}

// AppError는 카탈로그대로, 그 밖의 예외는 500 INTERNAL — 스택은 로그에만 [AC-CM-10, 13]
export function errorHandler(log: Logger): ErrorRequestHandler {
  // 인자 네 개여야 Express가 에러 처리기로 인식한다
  return (err: unknown, _req, res, _next) => {
    const known = err instanceof AppError ? err : fromBodyParser(err);
    const appError = known ?? new AppError('INTERNAL');

    if (known === null) {
      log.error('http', {
        reqId: res.locals.requestId,
        code: 'INTERNAL',
        err: err instanceof Error ? err.stack : String(err),
      });
    }

    res.locals.errorCode = appError.code;
    const body: ErrorResponse = {
      error: { code: appError.code, message: appError.message, fields: appError.fields },
    };
    res.status(appError.status).json(body);
  };
}

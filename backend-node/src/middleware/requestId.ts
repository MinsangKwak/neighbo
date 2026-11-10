import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { REQUEST_ID_HEADER } from '@neighbo/shared-schema';

// 받은 값은 로그와 응답 헤더에 그대로 실리므로 모양을 제한한다
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

// 프록시가 보낸 X-Request-Id를 쓰고 없으면 만든다. 응답 헤더에도 싣는다 [AC-CM-13]
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming !== undefined && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};

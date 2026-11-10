import express, { type Express } from 'express';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { createClientIp } from './lib/clientIp.js';
import type { Logger } from './lib/log.js';
import type { PasswordHasher } from './lib/password.js';
import { accessLog, mountedAt } from './middleware/accessLog.js';
import { createSession } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createOriginCheck, originGuard } from './middleware/origin.js';
import { createMemoryStore, rateLimit } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createAuthRouter } from './modules/auth/route.js';
import { createAuthService } from './modules/auth/service.js';
import { createMeRouter } from './modules/me/route.js';
import { createProductRouter } from './modules/products/route.js';
import { createProductService } from './modules/products/service.js';
import type { ImageStorage } from './storage/ImageStorage.js';

export interface AppDeps {
  config: Config;
  log: Logger;
  db: Db;
  hasher: PasswordHasher;
  storage: ImageStorage;
  // DB에 닿는지 확인한다. 실패하면 던진다
  pingDb: () => Promise<void>;
}

// 미들웨어 조립 순서가 이 파일 한 곳에 보이게 — 싸고 빠른 거절을 먼저
export function createApp({ config, log, db, hasher, storage, pingDb }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Railway의 프록시 한 홉만 믿는다 — req.ip의 기준 (T-02)
  app.set('trust proxy', 1);

  // ① 진입
  app.use(requestId);
  app.use(securityHeaders);
  app.use(accessLog(log));
  app.use(express.json({ limit: '1mb' }));
  app.use(originGuard(createOriginCheck(config.ALLOWED_ORIGIN, config.ALLOWED_ORIGIN_PATTERN)));

  // 상태 확인 — /healthz는 DB를 보지 않는다. DB 장애 때 재시작 루프에 빠지지 않게
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/readyz', async (_req, res) => {
    await pingDb();
    res.json({ status: 'ready' });
  });

  // ② 인증 · 기능 모듈
  const session = createSession(config, db);
  const clientIp = createClientIp(config.PROXY_SECRET);
  const limitStore = createMemoryStore();
  const ipLimit = (name: string) =>
    rateLimit({ store: limitStore, name, limit: 10, windowMs: 60_000, key: clientIp });

  app.use('/auth', mountedAt('/auth'), createAuthRouter({ service: createAuthService(db, hasher), session, ipLimit }));
  app.use('/me', mountedAt('/me'), createMeRouter({ session }));

  // 로그인한 사용자 기준 분당 30 — requireAuth 뒤에 둔다
  const userLimit = (name: string) =>
    rateLimit({
      store: limitStore,
      name,
      limit: 30,
      windowMs: 60_000,
      key: (_req, res) => String((res.locals.user as { id?: string } | undefined)?.id ?? 'anonymous'),
    });
  app.use(
    '/products',
    mountedAt('/products'),
    createProductRouter({
      service: createProductService(db, storage),
      session,
      writeLimit: userLimit('product-create'),
    }),
  );

  // ⑦ 에러 처리
  app.use(notFound);
  app.use(errorHandler(log));

  return app;
}

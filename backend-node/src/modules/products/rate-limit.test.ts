import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors/AppError.js';
import { createLogger } from '../../lib/log.js';
import type { Session } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { createMemoryStore, rateLimit } from '../../middleware/rateLimit.js';
import { createProductRouter } from './route.js';
import type { ProductService } from './service.js';

const LIMIT = 30;
const WINDOW_MS = 60_000;
const mutations = [
  { method: 'post', path: '/', action: 'create', body: { title: '의자', price: 1000, idempotencyKey: '00000000-0000-4000-8000-000000000001' } },
  { method: 'patch', path: '/p1', action: 'update', body: { title: '새 의자' } },
  { method: 'patch', path: '/p1/status', action: 'changeStatus', body: { status: 'RESERVED' } },
  { method: 'delete', path: '/p1', action: 'remove', body: {} },
] as const;

function fixture() {
  const store = createMemoryStore();
  const missing = async () => {
    throw new AppError('NOT_FOUND');
  };
  const service = {
    create: vi.fn(missing),
    update: vi.fn(missing),
    changeStatus: vi.fn(missing),
    remove: vi.fn(missing),
    favorite: vi.fn(missing),
    unfavorite: vi.fn(missing),
  };
  const requireAuth: RequestHandler = (req, res, next) => {
    const userId = req.get('X-Test-User');
    if (userId === undefined) {
      next(new AppError('UNAUTHORIZED'));
      return;
    }
    res.locals.user = { id: userId };
    next();
  };
  const session: Session = {
    requireAuth,
    optionalAuth: (_req, _res, next) => next(),
    setCookie: () => {},
    clearCookie: () => {},
  };
  const userLimit = (name: string) => rateLimit({
    store,
    name,
    limit: LIMIT,
    windowMs: WINDOW_MS,
    key: (_req, res) => String((res.locals.user as { id: string }).id),
  });
  const app = express();
  app.use(express.json());
  app.use('/products', createProductRouter({
    service: service as unknown as ProductService,
    session,
    writeLimit: userLimit,
    favoriteLimit: userLimit('favorite'),
  }));
  app.use(errorHandler(createLogger('error', () => {})));
  return { app, service };
}

describe('상품 쓰기 사용자별 제한', () => {
  it.each(mutations)('$method $path: 31번째 요청은 서비스를 호출하지 않고 429로 답한다', async (mutation) => {
    const { app, service } = fixture();
    for (let index = 0; index < LIMIT; index += 1) {
      const response = await request(app)[mutation.method](`/products${mutation.path}`)
        .set('X-Test-User', 'writer')
        .send(mutation.body);
      expect(response.status).toBe(404);
    }
    const blocked = await request(app)[mutation.method](`/products${mutation.path}`)
      .set('X-Test-User', 'writer')
      .send(mutation.body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(service[mutation.action]).toHaveBeenCalledTimes(LIMIT);

    const otherUser = await request(app)[mutation.method](`/products${mutation.path}`)
      .set('X-Test-User', 'another-writer')
      .send(mutation.body);
    expect(otherUser.status).toBe(404);
    expect(service[mutation.action]).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it('한 동작의 한도를 소진해도 다른 쓰기 동작과 관심 요청은 독립적으로 처리한다', async () => {
    const { app, service } = fixture();
    for (let index = 0; index < LIMIT; index += 1) {
      await request(app).patch('/products/p1').set('X-Test-User', 'writer').send({ title: '의자' });
    }
    expect((await request(app).patch('/products/p1').set('X-Test-User', 'writer').send({})).status).toBe(429);
    for (const mutation of mutations.filter((item) => item.action !== 'update')) {
      const response = await request(app)[mutation.method](`/products${mutation.path}`)
        .set('X-Test-User', 'writer')
        .send(mutation.body);
      expect(response.status).toBe(404);
      expect(service[mutation.action]).toHaveBeenCalledTimes(1);
    }
    expect((await request(app).put('/products/p1/favorite').set('X-Test-User', 'writer')).status).toBe(404);
    expect(service.favorite).toHaveBeenCalledTimes(1);
  });

  it('인증되지 않은 요청은 한도를 소비하거나 서비스를 호출하지 않는다', async () => {
    const { app, service } = fixture();
    for (let index = 0; index < LIMIT + 1; index += 1) {
      expect((await request(app).delete('/products/p1')).status).toBe(401);
    }
    expect(service.remove).not.toHaveBeenCalled();
    expect((await request(app).delete('/products/p1').set('X-Test-User', 'writer')).status).toBe(404);
    expect(service.remove).toHaveBeenCalledTimes(1);
  });
});

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '@neighbo/shared-schema';
import { createTestApp } from '../test/app.js';
import { AppError } from './errors/AppError.js';
import { createLogger } from './lib/log.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';

function setup(overrides: { pingDb?: () => Promise<void>; env?: Record<string, string> } = {}) {
  return createTestApp(overrides);
}

describe('상태 확인', () => {
  it('GET /healthz는 DB를 보지 않고 200을 준다', async () => {
    const { app } = setup({ pingDb: () => Promise.reject(new Error('db down')) });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz는 DB에 닿으면 200, 닿지 않으면 500 INTERNAL이다', async () => {
    expect((await request(setup().app).get('/readyz')).status).toBe(200);

    const down = setup({ pingDb: () => Promise.reject(new Error('db down')) });
    const res = await request(down.app).get('/readyz');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});

describe('요청 ID', () => {
  it('[AC-CM-13] 프록시가 보낸 X-Request-Id를 응답 헤더와 로그에 그대로 쓴다', async () => {
    const { app, lines } = setup();
    const res = await request(app).get('/healthz').set('X-Request-Id', 'req_from_proxy_0001');
    expect(res.headers['x-request-id']).toBe('req_from_proxy_0001');
    expect(lines.at(-1)).toMatchObject({
      msg: 'http',
      reqId: 'req_from_proxy_0001',
      method: 'GET',
      route: '/healthz',
      status: 200,
    });
  });

  it('없으면 만들고, 모양이 이상한 값은 버리고 새로 만든다', async () => {
    const { app } = setup();
    const created = await request(app).get('/healthz');
    expect(created.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const odd = await request(app).get('/healthz').set('X-Request-Id', 'a b\tc');
    expect(odd.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('에러 응답', () => {
  it('[AC-CM-10] 없는 경로는 404 NOT_FOUND를 약속한 모양으로 준다', async () => {
    const { app, lines } = setup();
    const res = await request(app).get('/nope/clx123');
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body)).toEqual({
      error: { code: 'NOT_FOUND', message: '찾을 수 없어요', fields: null },
    });
    expect(res.headers['x-request-id']).toBeDefined();
    // 실제 경로가 아니라 패턴을 남긴다 — 매칭된 라우트가 없으면 고정 문자열
    expect(lines.at(-1)).toMatchObject({ route: '(unmatched)', status: 404, code: 'NOT_FOUND' });
  });

  it('[AC-CM-13] 예상 못 한 예외는 500 INTERNAL이고 스택은 응답이 아니라 로그에만 있다', async () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger('info', (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
    const app = express();
    app.use(requestId);
    app.get('/boom', () => {
      throw new Error('비밀 내부 사정');
    });
    app.get('/known', () => {
      throw new AppError('EMAIL_TAKEN', { email: '이미 가입된 이메일이에요' });
    });
    app.use(errorHandler(log));

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: '일시적인 문제가 생겼어요', fields: null },
    });
    expect(JSON.stringify(res.body)).not.toContain('비밀 내부 사정');
    expect(res.headers['x-request-id']).toBeDefined();
    const logged = lines.find((l) => l.lvl === 'error');
    expect(logged?.reqId).toBe(res.headers['x-request-id']);
    expect(String(logged?.err)).toContain('비밀 내부 사정');

    const known = await request(app).get('/known');
    expect(known.status).toBe(409);
    expect(known.body.error.fields).toEqual({ email: '이미 가입된 이메일이에요' });
  });

  it('[AC-CM-34] 1MB를 넘는 본문은 413 PAYLOAD_TOO_LARGE다', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/anything')
      .set('Origin', 'http://localhost:3000')
      .send({ big: 'x'.repeat(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('깨진 JSON 본문은 400 VALIDATION_FAILED다', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/anything')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('쓰기 요청의 Origin 검사', () => {
  it('[AC-CM-31] 허용 목록 밖 · Origin 없는 쓰기 요청은 403 ORIGIN_MISMATCH다', async () => {
    const { app } = setup();
    const evil = await request(app).post('/anything').set('Origin', 'https://evil.example').send({});
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('ORIGIN_MISMATCH');

    const missing = await request(app).post('/anything').send({});
    expect(missing.body.error.code).toBe('ORIGIN_MISMATCH');
  });

  it('[AC-CM-31] 허용된 Origin의 쓰기 요청과 모든 조회 요청은 통과한다', async () => {
    const { app } = setup();
    // 검사를 지나 라우트 없음(404)까지 간다
    const ok = await request(app).post('/anything').set('Origin', 'http://localhost:3000').send({});
    expect(ok.body.error.code).toBe('NOT_FOUND');
    expect((await request(app).get('/healthz').set('Origin', 'https://evil.example')).status).toBe(200);
  });

  it('[T-08] staging은 미리보기 주소 패턴까지 받는다', async () => {
    const { app } = setup({
      env: { NODE_ENV: 'staging', ALLOWED_ORIGIN_PATTERN: '^https://neighbo-[a-z0-9-]+\\.vercel\\.app$' },
    });
    const preview = await request(app).post('/x').set('Origin', 'https://neighbo-pr-12.vercel.app').send({});
    expect(preview.body.error.code).toBe('NOT_FOUND');
    const other = await request(app).post('/x').set('Origin', 'https://neighbo-pr-12.vercel.app.evil.io').send({});
    expect(other.body.error.code).toBe('ORIGIN_MISMATCH');
  });
});

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { authResponseSchema } from '@neighbo/shared-schema';
import { createTestApp, db, post, resetDb, sessionCookie } from '../../../test/app.js';
import { SESSION_TTL_SECONDS } from '../../middleware/auth.js';
import { signToken } from '../../lib/jwt.js';

const kim = { email: 'kim@example.com', password: 'correct horse', passwordConfirm: 'correct horse', nickname: '김당근' };

beforeEach(resetDb);

describe('POST /auth/signup', () => {
  it('[AC-SU-01, 23] 유효한 입력은 201 · 세션 쿠키 · 본인용 사용자를 주고 약속한 필드로 저장한다', async () => {
    const { app } = createTestApp();
    const res = await post(app, '/auth/signup').send({ ...kim, email: ' KIM@Example.com ' });
    expect(res.status).toBe(201);
    const { user } = authResponseSchema.parse(res.body);
    expect(user).toMatchObject({ email: 'kim@example.com', nickname: '김당근', avatarUrl: null });

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^nb_session=[\w-]+\.[\w-]+\.[\w-]+; Max-Age=604800; HttpOnly; SameSite=Lax; Path=\/$/);

    const saved = await db.user.findUniqueOrThrow({ where: { email: 'kim@example.com' } });
    expect(saved).toMatchObject({ nicknameLower: '김당근', tokenVersion: 0, avatarUrl: null, isDemo: false });
    expect(saved.passwordHash).toMatch(/^\$2b\$10\$/);
  });

  it('[AC-CM-14] 어떤 응답에도 비밀번호 해시가 없다', async () => {
    const { app } = createTestApp();
    const res = await post(app, '/auth/signup').send(kim);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);
    expect(Object.keys(res.body.user).sort()).toEqual(['avatarUrl', 'createdAt', 'email', 'id', 'nickname']);
  });

  it('[AC-CM-31] staging · production의 쿠키에는 Secure가 붙는다', async () => {
    const { app } = createTestApp({ env: { NODE_ENV: 'production' } });
    const res = await post(app, '/auth/signup').send(kim);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/; Secure$/);
  });

  it('[AC-SU-17, AC-CM-11] 틀린 칸 전부를 fields로 돌려주고 아무것도 저장하지 않는다', async () => {
    const { app } = createTestApp();
    const res = await post(app, '/auth/signup').send({ email: 'x', password: 'short', passwordConfirm: 'other', nickname: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toEqual({
      email: '이메일 형식이 아니에요',
      password: '8자 이상 입력해 주세요',
      passwordConfirm: '비밀번호가 일치하지 않아요',
      nickname: '닉네임을 입력해 주세요',
    });
    expect(await db.user.count()).toBe(0);
  });

  it('[AC-SU-09] 흔한 비밀번호는 거부한다', async () => {
    const { app } = createTestApp();
    const res = await post(app, '/auth/signup').send({ ...kim, password: 'Password1', passwordConfirm: 'Password1' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ password: '너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요' });
  });

  it('[AC-SU-07] 이미 가입된 이메일은 409 EMAIL_TAKEN이다 (대소문자가 달라도)', async () => {
    const { app } = createTestApp();
    await post(app, '/auth/signup').send(kim);
    const res = await post(app, '/auth/signup').send({ ...kim, email: 'KIM@example.com', nickname: '다른이름' });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'EMAIL_TAKEN',
      message: '이미 가입된 이메일이에요',
      fields: { email: '이미 가입된 이메일이에요' },
    });
  });

  it('[AC-SU-14] 대소문자만 다른 닉네임은 409 NICKNAME_TAKEN이고 표시는 입력한 대로다', async () => {
    const { app } = createTestApp();
    const first = await post(app, '/auth/signup').send({ ...kim, nickname: 'Kim' });
    expect(first.body.user.nickname).toBe('Kim');
    const res = await post(app, '/auth/signup').send({ ...kim, email: 'other@example.com', nickname: 'kim' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NICKNAME_TAKEN');
    expect(res.body.error.fields).toEqual({ nickname: '이미 사용 중인 닉네임이에요' });
  });

  it('[AC-SU-20] 같은 이메일로 동시에 가입하면 한쪽만 성공하고 나머지는 409다', async () => {
    const { app } = createTestApp();
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => post(app, '/auth/signup').send({ ...kim, nickname: `동시${n}` })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await db.user.count()).toBe(1);
  });
});

describe('POST /auth/login', () => {
  async function signedUp() {
    const ctx = createTestApp();
    await post(ctx.app, '/auth/signup').send(kim);
    return ctx;
  }

  it('[AC-LI-01, 02, 05a, 05b, 20] 대소문자 · 앞뒤 공백이 달라도 로그인되고 lastLoginAt이 갱신된다', async () => {
    const { app } = await signedUp();
    const res = await post(app, '/auth/login').send({ email: ' Kim@EXAMPLE.com', password: ' correct horse ' });
    expect(res.status).toBe(200);
    expect(authResponseSchema.parse(res.body).user.email).toBe('kim@example.com');
    expect(sessionCookie(res)).toMatch(/^nb_session=/);
    const saved = await db.user.findUniqueOrThrow({ where: { email: 'kim@example.com' } });
    expect(saved.lastLoginAt).not.toBeNull();
  });

  it('[AC-LI-06] 없는 이메일과 틀린 비밀번호는 같은 401 · 같은 본문이다', async () => {
    const { app } = await signedUp();
    const wrong = await post(app, '/auth/login').send({ email: kim.email, password: 'wrong password' });
    const missing = await post(app, '/auth/login').send({ email: 'nobody@example.com', password: 'wrong password' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: '이메일 또는 비밀번호가 맞지 않아요',
      fields: null,
    });
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('[AC-LI-05] 형식 위반만 400이고 비밀번호 규칙은 검사하지 않는다', async () => {
    const { app } = await signedUp();
    const bad = await post(app, '/auth/login').send({ email: 'not-an-email', password: '' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(['email', 'password']);
    // 규칙에 안 맞는 짧은 비밀번호도 형식 오류가 아니라 자격 오류로 답한다
    const short = await post(app, '/auth/login').send({ email: kim.email, password: 'x' });
    expect(short.status).toBe(401);
  });
});

describe('세션', () => {
  async function loggedIn(env?: Record<string, string>) {
    const ctx = createTestApp(env === undefined ? {} : { env });
    const res = await post(ctx.app, '/auth/signup').send(kim);
    return { ...ctx, cookie: sessionCookie(res), userId: res.body.user.id as string };
  }

  it('[AC-LI-03] GET /me는 쿠키의 사용자를 돌려주고 캐시하지 않게 한다', async () => {
    const { app, cookie } = await loggedIn();
    const res = await request(app).get('/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(kim.email);
    expect(res.headers['cache-control']).toBe('no-store');
    // 남은 기간이 절반 위면 쿠키를 다시 주지 않는다
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('[AC-CM-02] 쿠키 없이 부르면 401 UNAUTHORIZED다', async () => {
    const { app } = await loggedIn();
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('[AC-CM-04] 변조된 토큰 · 다른 비밀로 서명한 토큰은 401이고 쿠키 삭제 헤더가 온다', async () => {
    const { app, cookie, userId } = await loggedIn();
    const tampered = `${cookie.slice(0, -2)}xx`;
    const forged = `nb_session=${signToken({ sub: userId, ver: 0, purpose: 'session' }, 'x'.repeat(40), 60)}`;
    for (const bad of [tampered, forged, 'nb_session=garbage']) {
      const res = await request(app).get('/me').set('Cookie', bad);
      expect(res.status).toBe(401);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^nb_session=; Max-Age=0;/);
    }
  });

  it('[AC-CM-04] tokenVersion이 올라가면 옛 토큰은 401이다', async () => {
    const { app, cookie, userId } = await loggedIn();
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    expect((await request(app).get('/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('소켓용 토큰 · 만료된 토큰은 세션 자리에서 통과하지 못한다', async () => {
    const { app, config, userId } = await loggedIn();
    const socket = signToken({ sub: userId, ver: 0, purpose: 'socket' }, config.JWT_SECRET, 60);
    const expired = signToken(
      { sub: userId, ver: 0, purpose: 'session' },
      config.JWT_SECRET,
      60,
      new Date(Date.now() - 120_000),
    );
    for (const token of [socket, expired]) {
      expect((await request(app).get('/me').set('Cookie', `nb_session=${token}`)).status).toBe(401);
    }
  });

  it('[AC-CM-03] 남은 기간이 절반 아래면 응답에 새 쿠키가 온다', async () => {
    const { app, config, userId } = await loggedIn();
    // 4일 전에 발급된 7일짜리 토큰 — 3일 남음
    const issued = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const old = signToken({ sub: userId, ver: 0, purpose: 'session' }, config.JWT_SECRET, SESSION_TTL_SECONDS, issued);
    const res = await request(app).get('/me').set('Cookie', `nb_session=${old}`);
    expect(res.status).toBe(200);
    const renewed = sessionCookie(res);
    expect(renewed).not.toBe(`nb_session=${old}`);
    expect((await request(app).get('/me').set('Cookie', renewed)).status).toBe(200);
  });

  it('[AC-LI-12] 로그아웃은 쿠키를 지우고, 쿠키가 없어도 204다', async () => {
    const { app, cookie } = await loggedIn();
    const res = await post(app, '/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^nb_session=; Max-Age=0;/);
    expect((await post(app, '/auth/logout')).status).toBe(204);
  });
});

describe('중복 미리 확인', () => {
  it('[AC-SU-08, 16] 쓸 수 있는지와 칸 아래에 보일 문구를 돌려준다', async () => {
    const { app } = createTestApp();
    await post(app, '/auth/signup').send({ ...kim, nickname: 'Kim' });
    expect((await request(app).get('/auth/email-available').query({ email: 'new@example.com' })).body).toEqual({
      available: true,
      message: null,
    });
    expect((await request(app).get('/auth/email-available').query({ email: 'KIM@example.com' })).body).toEqual({
      available: false,
      message: '이미 가입된 이메일이에요',
    });
    expect((await request(app).get('/auth/nickname-available').query({ nickname: 'kim' })).body.available).toBe(false);
    const bad = await request(app).get('/auth/nickname-available').query({ nickname: '김' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toEqual({ nickname: '2~12자로 입력해 주세요' });
  });
});

describe('IP rate limit', () => {
  it('[AC-CM-32, AC-LI-11] 같은 IP의 11번째 로그인은 429 + Retry-After이고 계정은 잠기지 않는다', async () => {
    const { app } = createTestApp();
    await post(app, '/auth/signup').send(kim);
    const attempt = () => post(app, '/auth/login').send({ email: kim.email, password: 'wrong password' });
    for (let i = 0; i < 10; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('[T-02] 프록시가 공유 비밀과 함께 넘긴 원 IP마다 따로 세고, 비밀이 틀린 헤더는 믿지 않는다', async () => {
    const { app, config } = createTestApp();
    const from = (ip: string, secret: string) =>
      post(app, '/auth/login')
        .set('X-Client-IP', ip)
        .set('X-Proxy-Secret', secret)
        .send({ email: 'nobody@example.com', password: 'wrong password' });

    for (let i = 0; i < 10; i += 1) await from('203.0.113.1', config.PROXY_SECRET);
    expect((await from('203.0.113.1', config.PROXY_SECRET)).status).toBe(429);
    // 다른 사용자는 막히지 않는다
    expect((await from('203.0.113.2', config.PROXY_SECRET)).status).toBe(401);

    // 비밀 없이 헤더만 바꿔 한도를 피할 수 없다 — 전부 같은 연결 IP로 센다
    for (let i = 0; i < 10; i += 1) await from(`198.51.100.${i}`, 'forged');
    expect((await from('198.51.100.99', 'forged')).status).toBe(429);
  });
});

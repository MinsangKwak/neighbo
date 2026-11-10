import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, db, post, resetDb } from '../../test/app.js';
import { createPasswordHasher } from '../lib/password.js';
import { DEMO_ACCOUNTS, seedDemoAccounts } from './demo.js';

const hasher = await createPasswordHasher(10);

beforeEach(resetDb);

describe('데모 계정 시드', () => {
  it('[AC-LI-19] 판매자 · 구매자 역할의 데모 계정 두 개를 isDemo로 만들고, 그 비밀번호로 로그인된다', async () => {
    await seedDemoAccounts(db, hasher, 'demo password 1');
    const users = await db.user.findMany({ orderBy: { id: 'asc' } });
    expect(users.map((u) => [u.id, u.email, u.isDemo])).toEqual([
      ['demo_buyer', 'demo2@neighbo.app', true],
      ['demo_seller', 'demo@neighbo.app', true],
    ]);

    const { app } = createTestApp();
    for (const account of DEMO_ACCOUNTS) {
      const res = await post(app, '/auth/login').send({ email: account.email, password: 'demo password 1' });
      expect(res.status).toBe(200);
      expect(res.body.user.nickname).toBe(account.nickname);
    }
  });

  it('몇 번을 돌려도 같은 결과다 — 행이 늘지 않고, 해시와 tokenVersion이 그대로다', async () => {
    await seedDemoAccounts(db, hasher, 'demo password 1');
    await db.user.update({ where: { id: 'demo_seller' }, data: { tokenVersion: 3 } });
    const before = await db.user.findUniqueOrThrow({ where: { id: 'demo_seller' } });

    await seedDemoAccounts(db, hasher, 'demo password 1');
    const after = await db.user.findUniqueOrThrow({ where: { id: 'demo_seller' } });
    expect(await db.user.count()).toBe(2);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.tokenVersion).toBe(3);
  });

  it('비밀번호가 바뀌면 새 비밀번호만 통하고, 바뀐 닉네임은 시드 값으로 돌아온다', async () => {
    await seedDemoAccounts(db, hasher, 'demo password 1');
    await db.user.update({ where: { id: 'demo_buyer' }, data: { nickname: '바뀐이름', nicknameLower: '바뀐이름' } });
    await seedDemoAccounts(db, hasher, 'demo password 2');

    const { app } = createTestApp();
    const login = (password: string) => post(app, '/auth/login').send({ email: 'demo2@neighbo.app', password });
    expect((await login('demo password 1')).status).toBe(401);
    const ok = await login('demo password 2');
    expect(ok.status).toBe(200);
    expect(ok.body.user.nickname).toBe('데모구매자');
  });

  it('비밀번호는 로그인과 같은 방식으로 정규화해 해시한다 — 앞뒤 공백 · 제로폭 문자가 섞여 있어도 로그인된다', async () => {
    await seedDemoAccounts(db, hasher, '  demo\u200B password 1 ');
    const { app } = createTestApp();
    const res = await post(app, '/auth/login').send({ email: 'demo@neighbo.app', password: 'demo password 1' });
    expect(res.status).toBe(200);
  });

  it('데모 이메일 · 닉네임을 다른 계정이 이미 쓰고 있으면 그 계정은 두고 건너뛴다 (실패로 끝나지 않는다)', async () => {
    await db.user.create({
      data: { email: 'demo@neighbo.app', passwordHash: 'x', nickname: 'Squatter', nicknameLower: 'squatter' },
    });
    await db.user.create({
      data: { email: 'someone@example.com', passwordHash: 'x', nickname: '데모구매자', nicknameLower: '데모구매자' },
    });
    const report = await seedDemoAccounts(db, hasher, 'demo password 1');
    expect(report).toEqual({ seeded: [], conflicts: ['demo@neighbo.app', 'demo2@neighbo.app'] });
    expect(await db.user.count()).toBe(2);
    expect(await db.user.count({ where: { isDemo: true } })).toBe(0);
  });
});

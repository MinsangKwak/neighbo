import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { NEIGHBORHOODS } from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, sessionCookie, signup, storage } from '../../test/app.js';
import { resetDemo } from '../jobs/demoReset.js';
import { createPasswordHasher } from '../lib/password.js';
import { seedDemoAccounts } from '../seed/demo.js';

beforeEach(resetDb);

type App = ReturnType<typeof createTestApp>['app'];

const patchMe = (app: App, cookie: string, body: Record<string, unknown>) =>
  request(app).patch('/me').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
const list = (app: App, query = '') => request(app).get(`/products${query}`);
const titles = (res: request.Response) => (res.body.items as { title: string }[]).map((item) => item.title);

async function create(app: App, cookie: string, title: string) {
  const res = await post(app, '/products').set('Cookie', cookie).send({ title, price: 10000, idempotencyKey: randomUUID() });
  return res.body.product.id as string;
}

describe('동네 고르기', () => {
  it('AC-NB-01 가입한 직후에는 동네가 없다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    const res = await request(app).get('/me').set('Cookie', kim.cookie);
    expect(res.body.user.neighborhood).toBeNull();
  });

  it('AC-NB-02 목록에 있는 동네를 저장하고, null로 되돌린다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');

    const saved = await patchMe(app, kim.cookie, { neighborhood: '마포구' });
    expect(saved.status).toBe(200);
    expect(saved.body.user.neighborhood).toBe('마포구');

    const cleared = await patchMe(app, kim.cookie, { neighborhood: null });
    expect(cleared.body.user.neighborhood).toBeNull();
  });

  it('AC-NB-02 목록에 없는 값은 400이고 저장되지 않는다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    for (const neighborhood of ['강남', '부산 해운대구', '', 3]) {
      const res = await patchMe(app, kim.cookie, { neighborhood });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    const row = await db.user.findUniqueOrThrow({ where: { id: kim.id } });
    expect(row.neighborhood).toBeNull();
  });

  it('AC-NB-02 닉네임만 바꾸는 요청은 동네를 건드리지 않는다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    await patchMe(app, kim.cookie, { neighborhood: '종로구' });
    const res = await patchMe(app, kim.cookie, { nickname: '새이름' });
    expect(res.body.user.neighborhood).toBe('종로구');
  });

  it('AC-NB-09 둘러보기 계정은 동네를 바꿀 수 없고, 초기화가 처음 동네로 되돌린다', async () => {
    const { app } = createTestApp();
    await seedDemoAccounts(db, await createPasswordHasher(10), 'demo password 1');
    const login = await post(app, '/auth/login').send({ email: 'demo@neighbo.app', password: 'demo password 1' });
    expect(login.body.user.neighborhood).toBe('마포구');

    const res = await patchMe(app, sessionCookie(login), { neighborhood: '종로구' });
    expect(res.status).toBe(403);

    // 누가 표를 직접 고쳤더라도 초기화가 되돌린다
    await db.user.update({ where: { id: 'demo_seller' }, data: { neighborhood: '종로구' } });
    await resetDemo(db, storage, { sample: false });
    const row = await db.user.findUniqueOrThrow({ where: { id: 'demo_seller' } });
    expect(row.neighborhood).toBe('마포구');
  });
});

describe('상품의 동네', () => {
  it('AC-NB-03 상품은 올릴 때 판매자의 동네를 갖고, 카드와 상세에 실린다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    const before = await create(app, kim.cookie, '동네 없이 올린 의자');
    await patchMe(app, kim.cookie, { neighborhood: '마포구' });
    // 동네를 정하면 판매 중인 물건도 따라간다 — 아래 AC-NB-04
    await db.product.update({ where: { id: before }, data: { neighborhood: null } });
    const after = await create(app, kim.cookie, '마포에서 올린 책상');

    const page = await list(app);
    const byTitle = Object.fromEntries((page.body.items as { title: string; neighborhood: string | null }[]).map((item) => [item.title, item.neighborhood]));
    expect(byTitle).toEqual({ '동네 없이 올린 의자': null, '마포에서 올린 책상': '마포구' });

    const detail = await request(app).get(`/products/${after}`);
    expect(detail.body.product.neighborhood).toBe('마포구');
    expect(detail.body.product.seller.neighborhood).toBe('마포구');
  });

  it('AC-NB-04 동네를 바꾸면 판매중 · 예약중 물건은 따라가고, 거래완료는 그때의 동네로 남는다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    const lee = await signup(app, 'lee');
    await patchMe(app, kim.cookie, { neighborhood: '마포구' });
    const onSale = await create(app, kim.cookie, '판매중');
    const reserved = await create(app, kim.cookie, '예약중');
    const sold = await create(app, kim.cookie, '거래완료');
    const others = await create(app, lee.cookie, '남의 물건');
    await db.product.update({ where: { id: reserved }, data: { status: 'RESERVED' } });
    await db.product.update({ where: { id: sold }, data: { status: 'SOLD', soldAt: new Date() } });

    await patchMe(app, kim.cookie, { neighborhood: '은평구' });

    const rows = await db.product.findMany({ where: { id: { in: [onSale, reserved, sold, others] } } });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.neighborhood]));
    expect(byId).toEqual({ [onSale]: '은평구', [reserved]: '은평구', [sold]: '마포구', [others]: null });
  });

  it('AC-NB-05 ?neighborhood= 는 그 동네의 물건만 돌려주고, 검색 · 판매완료 숨기기와 함께 쓸 수 있다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    const lee = await signup(app, 'lee');
    const park = await signup(app, 'park');
    await patchMe(app, kim.cookie, { neighborhood: '마포구' });
    await patchMe(app, lee.cookie, { neighborhood: '은평구' });
    await create(app, kim.cookie, '마포 의자');
    const soldId = await create(app, kim.cookie, '마포 책상');
    await create(app, lee.cookie, '은평 의자');
    await create(app, park.cookie, '동네 없는 의자');
    await db.product.update({ where: { id: soldId }, data: { status: 'SOLD', soldAt: new Date() } });

    const query = (value: string) => `?neighborhood=${encodeURIComponent(value)}`;
    expect(titles(await list(app, query('마포구'))).sort()).toEqual(['마포 의자', '마포 책상']);
    expect(titles(await list(app, query('은평구')))).toEqual(['은평 의자']);
    expect(titles(await list(app, query('종로구')))).toEqual([]);
    expect(titles(await list(app, `${query('마포구')}&q=${encodeURIComponent('의자')}`))).toEqual(['마포 의자']);
    expect(titles(await list(app, `${query('마포구')}&hideSold=1`))).toEqual(['마포 의자']);
    // 거르지 않으면 동네가 없는 물건까지 모두 나온다
    expect(titles(await list(app))).toHaveLength(4);
  });

  it('AC-NB-05 목록에 없는 동네로 거르면 400이다', async () => {
    const { app } = createTestApp();
    const res = await list(app, `?neighborhood=${encodeURIComponent('강남')}`);
    expect(res.status).toBe(400);
  });

  it('AC-NB-06 판매자 프로필에 동네가 실린다', async () => {
    const { app } = createTestApp();
    const kim = await signup(app, 'kim');
    await patchMe(app, kim.cookie, { neighborhood: '용산구' });
    const res = await request(app).get(`/users/${kim.id}`);
    expect(res.body.user.neighborhood).toBe('용산구');
  });
});

describe('동네 목록', () => {
  it('AC-NB-01 서울의 25개 구이고 겹치지 않는다', () => {
    expect(NEIGHBORHOODS).toHaveLength(25);
    expect(new Set(NEIGHBORHOODS).size).toBe(25);
    for (const name of NEIGHBORHOODS) expect(name).toMatch(/^[가-힣]+구$/);
  });
});

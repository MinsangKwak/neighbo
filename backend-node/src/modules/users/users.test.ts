import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { productPageSchema, userProfileResponseSchema } from '@neighbo/shared-schema';
import { createTestApp, ORIGIN, post, resetDb, signup } from '../../../test/app.js';

beforeEach(resetDb);

type App = ReturnType<typeof createTestApp>['app'];

async function createProduct(app: App, cookie: string, title: string) {
  const res = await post(app, '/products').set('Cookie', cookie).send({ title, price: 15000, idempotencyKey: randomUUID() });
  return res.body.product.id as string;
}
const withCookie = (app: App, method: 'patch' | 'delete', path: string, cookie: string) =>
  request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookie);

describe('GET /users/{id}', () => {
  it('AC-UP-01 로그인 없이 닉네임 · 아바타 · 가입 시각과 상태별 판매 수를 본다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    await createProduct(app, seller.cookie, '판매중 하나');
    await createProduct(app, seller.cookie, '판매중 둘');
    const reserved = await createProduct(app, seller.cookie, '예약중');
    await withCookie(app, 'patch', `/products/${reserved}/status`, seller.cookie).send({ status: 'RESERVED' });

    const res = await request(app).get(`/users/${seller.id}`);

    expect(res.status).toBe(200);
    const body = userProfileResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({ id: seller.id, nickname: 'seller', avatarUrl: null });
    expect(body.counts).toEqual({ onSale: 2, reserved: 1, sold: 0 });
  });

  it('AC-UP-02 이메일과 구매 수는 내보내지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');

    const res = await request(app).get(`/users/${seller.id}`);

    expect(JSON.stringify(res.body)).not.toContain('example.com');
    expect(Object.keys(res.body.user as object).sort()).toEqual(['avatarUrl', 'createdAt', 'id', 'nickname']);
    expect(Object.keys(res.body.counts as object).sort()).toEqual(['onSale', 'reserved', 'sold']);
  });

  it('AC-UP-05 삭제한 물건은 세지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const gone = await createProduct(app, seller.cookie, '내린 물건');
    await createProduct(app, seller.cookie, '남은 물건');
    await withCookie(app, 'delete', `/products/${gone}`, seller.cookie);

    const res = await request(app).get(`/users/${seller.id}`);

    expect(res.body.counts).toEqual({ onSale: 1, reserved: 0, sold: 0 });
  });

  it('AC-UP-06 없는 사용자는 404다', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/users/nobody');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /products?sellerId=', () => {
  it('AC-UP-03 그 판매자가 올린 것만 최신순으로 주고, 다른 조건과 함께 쓸 수 있다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    const first = await createProduct(app, seller.cookie, '첫 물건');
    await createProduct(app, other.cookie, '남의 물건');
    const second = await createProduct(app, seller.cookie, '둘째 물건');
    await withCookie(app, 'patch', `/products/${first}/status`, seller.cookie).send({ status: 'SOLD' });

    const all = productPageSchema.parse((await request(app).get(`/products?sellerId=${seller.id}`)).body);
    expect(all.items.map((item) => item.id)).toEqual([second, first]);

    const open = productPageSchema.parse((await request(app).get(`/products?sellerId=${seller.id}&hideSold=1`)).body);
    expect(open.items.map((item) => item.id)).toEqual([second]);
  });

  it('AC-UP-03 여러 쪽으로 나뉘어도 그 판매자의 것만 이어진다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    for (let index = 0; index < 3; index += 1) {
      await createProduct(app, seller.cookie, `내 물건 ${index}`);
      await createProduct(app, other.cookie, `남의 물건 ${index}`);
    }

    const page1 = productPageSchema.parse((await request(app).get(`/products?sellerId=${seller.id}&limit=2`)).body);
    const page2 = productPageSchema.parse(
      (await request(app).get(`/products?sellerId=${seller.id}&limit=2&cursor=${page1.nextCursor ?? ''}`)).body,
    );

    expect([...page1.items, ...page2.items].map((item) => item.title)).toEqual(['내 물건 2', '내 물건 1', '내 물건 0']);
    expect(page2.nextCursor).toBeNull();
  });

  it('없는 판매자면 빈 목록이다', async () => {
    const { app } = createTestApp();
    const page = productPageSchema.parse((await request(app).get('/products?sellerId=nobody')).body);
    expect(page).toEqual({ items: [], nextCursor: null });
  });
});

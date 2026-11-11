import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { favoriteResponseSchema, productDetailResponseSchema, productPageSchema } from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, signup } from '../../../test/app.js';

beforeEach(resetDb);

type App = ReturnType<typeof createTestApp>['app'];

async function createProduct(app: App, cookie: string, title: string) {
  const res = await post(app, '/products').set('Cookie', cookie).send({ title, price: 15000, idempotencyKey: randomUUID() });
  return res.body.product.id as string;
}
const put = (app: App, id: string, cookie: string) =>
  request(app).put(`/products/${id}/favorite`).set('Origin', ORIGIN).set('Cookie', cookie);
const del = (app: App, path: string, cookie: string) => request(app).delete(path).set('Origin', ORIGIN).set('Cookie', cookie);
const detail = async (app: App, id: string, cookie?: string) => {
  const req = request(app).get(`/products/${id}`);
  return productDetailResponseSchema.parse((await (cookie === undefined ? req : req.set('Cookie', cookie))).body);
};

async function setup() {
  const { app } = createTestApp();
  const seller = await signup(app, 'seller');
  const buyer = await signup(app, 'buyer');
  const productId = await createProduct(app, seller.cookie, '원목 의자');
  return { app, seller, buyer, productId };
}

describe('관심 켜기 · 끄기', () => {
  it('AC-FV-01 켜면 내 표시와 개수가 바뀌고, 두 번 켜도 한 번이다', async () => {
    const { app, buyer, productId } = await setup();

    const first = await put(app, productId, buyer.cookie);
    const second = await put(app, productId, buyer.cookie);

    expect(first.status).toBe(200);
    expect(favoriteResponseSchema.parse(second.body)).toEqual({ isFavorite: true, favoriteCount: 1 });
    expect(await db.favorite.count()).toBe(1);
  });

  it('AC-FV-01 동시에 여러 번 눌러도 한 줄만 남는다', async () => {
    const { app, buyer, productId } = await setup();

    const results = await Promise.all(Array.from({ length: 8 }, () => put(app, productId, buyer.cookie)));

    expect(results.map((res) => res.status)).toEqual(Array(8).fill(200));
    expect(await db.favorite.count()).toBe(1);
  });

  it('AC-FV-02 끄면 사라지고, 없던 것을 꺼도 성공이다', async () => {
    const { app, buyer, productId } = await setup();
    await put(app, productId, buyer.cookie);

    const first = await del(app, `/products/${productId}/favorite`, buyer.cookie);
    const second = await del(app, `/products/${productId}/favorite`, buyer.cookie);

    expect(first.body).toEqual({ isFavorite: false, favoriteCount: 0 });
    expect(second.status).toBe(200);
    expect(await db.favorite.count()).toBe(0);
  });

  it('AC-FV-03 자기 물건에는 켤 수 없다', async () => {
    const { app, seller, productId } = await setup();
    const res = await put(app, productId, seller.cookie);
    expect(res.status).toBe(403);
    expect(await db.favorite.count()).toBe(0);
  });

  it('AC-FV-04 로그인이 없으면 401, 없는 물건 · 삭제된 물건은 404다', async () => {
    const { app, seller, buyer, productId } = await setup();

    expect((await request(app).put(`/products/${productId}/favorite`).set('Origin', ORIGIN)).status).toBe(401);
    expect((await put(app, 'nothing', buyer.cookie)).status).toBe(404);
    await del(app, `/products/${productId}`, seller.cookie);
    expect((await put(app, productId, buyer.cookie)).status).toBe(404);
  });

  it('AC-FV-02 물건이 삭제된 뒤에도 끌 수 있다', async () => {
    const { app, seller, buyer, productId } = await setup();
    await put(app, productId, buyer.cookie);
    await del(app, `/products/${productId}`, seller.cookie);

    const res = await del(app, `/products/${productId}/favorite`, buyer.cookie);

    expect(res.status).toBe(200);
    expect(await db.favorite.count()).toBe(0);
  });
});

describe('상세의 관심 정보', () => {
  it('AC-FV-05 개수는 누구에게나, 내 표시는 누른 사람에게만 참이다', async () => {
    const { app, seller, buyer, productId } = await setup();
    const other = await signup(app, 'other');
    await put(app, productId, buyer.cookie);
    await put(app, productId, other.cookie);

    expect((await detail(app, productId)).product.favoriteCount).toBe(2);
    expect((await detail(app, productId)).viewer).toBeNull();
    expect((await detail(app, productId, buyer.cookie)).viewer?.isFavorite).toBe(true);
    expect((await detail(app, productId, seller.cookie)).viewer?.isFavorite).toBe(false);
    await del(app, `/products/${productId}/favorite`, buyer.cookie);
    expect((await detail(app, productId, buyer.cookie)).viewer?.isFavorite).toBe(false);
    expect((await detail(app, productId, buyer.cookie)).product.favoriteCount).toBe(1);
  });
});

describe('GET /me/favorites', () => {
  const list = async (app: App, cookie: string, query = '') =>
    productPageSchema.parse((await request(app).get(`/me/favorites${query}`).set('Cookie', cookie)).body);

  it('AC-FV-06 누른 순서의 역순이고, 남이 누른 것은 섞이지 않는다', async () => {
    const { app, seller, buyer } = await setup();
    const other = await signup(app, 'other');
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) ids.push(await createProduct(app, seller.cookie, `물건 ${index}`));
    // 등록 순서와 다르게 누른다
    for (const id of [ids[1], ids[2], ids[0]]) await put(app, id ?? '', buyer.cookie);
    await put(app, ids[2] ?? '', other.cookie);

    const page1 = await list(app, buyer.cookie, '?limit=2');
    const page2 = await list(app, buyer.cookie, `?limit=2&cursor=${page1.nextCursor ?? ''}`);

    expect([...page1.items, ...page2.items].map((item) => item.title)).toEqual(['물건 0', '물건 2', '물건 1']);
    expect(page2.nextCursor).toBeNull();
    expect((await list(app, other.cookie)).items.map((item) => item.title)).toEqual(['물건 2']);
  });

  it('AC-FV-07 삭제된 물건은 목록에서 빠지고, 거래완료된 물건은 남는다', async () => {
    const { app, seller, buyer, productId } = await setup();
    const sold = await createProduct(app, seller.cookie, '팔린 물건');
    await put(app, productId, buyer.cookie);
    await put(app, sold, buyer.cookie);
    await request(app).patch(`/products/${sold}/status`).set('Origin', ORIGIN).set('Cookie', seller.cookie).send({ status: 'SOLD' });
    await del(app, `/products/${productId}`, seller.cookie);

    const page = await list(app, buyer.cookie);

    expect(page.items.map((item) => [item.title, item.status])).toEqual([['팔린 물건', 'SOLD']]);
  });

  it('로그인이 없으면 401이다', async () => {
    const { app } = createTestApp();
    expect((await request(app).get('/me/favorites')).status).toBe(401);
  });
});

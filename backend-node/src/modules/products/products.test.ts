import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { productDetailResponseSchema, productPageSchema } from '@neighbo/shared-schema';
import { createTestApp, db, post, resetDb, sessionCookie, ORIGIN } from '../../../test/app.js';

beforeEach(resetDb);

type App = ReturnType<typeof createTestApp>['app'];

async function signup(app: App, name: string) {
  const res = await post(app, '/auth/signup').send({
    email: `${name}@example.com`,
    password: 'correct horse',
    passwordConfirm: 'correct horse',
    nickname: name,
  });
  return { id: res.body.user.id as string, cookie: sessionCookie(res) };
}

function create(app: App, cookie: string, body: Record<string, unknown> = {}) {
  return post(app, '/products')
    .set('Cookie', cookie)
    .send({ title: '원목 의자', price: 15000, description: '상태 좋아요', idempotencyKey: randomUUID(), ...body });
}

const patch = (app: App, path: string, cookie: string) => request(app).patch(path).set('Origin', ORIGIN).set('Cookie', cookie);
const del = (app: App, path: string, cookie: string) => request(app).delete(path).set('Origin', ORIGIN).set('Cookie', cookie);

async function makeUpload(uploaderId: string, data: Record<string, unknown> = {}) {
  const key = randomUUID();
  return db.upload.create({
    data: {
      uploaderId,
      kind: 'PRODUCT',
      storageKey: `products/${key}.webp`,
      url: `/api/files/products/${key}.webp`,
      thumbnailUrl: `/api/files/products/${key}.thumb.webp`,
      width: 1600,
      height: 1200,
      ...data,
    },
  });
}

describe('POST /products', () => {
  it('[AC-PC-01, 02, 03] 사진 없이도 201로 만들어지고 항상 판매중이다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const res = await create(app, seller.cookie, { title: ' 원목\n의자 ', status: 'SOLD' });
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({
      title: '원목 의자',
      price: 15000,
      status: 'ON_SALE',
      images: [],
      chatRoomCount: 0,
      soldAt: null,
      seller: { id: seller.id, nickname: 'seller' },
    });
    expect(res.body.product.seller.email).toBeUndefined();
  });

  it('[AC-CM-02] 로그인하지 않으면 401이다', async () => {
    const { app } = createTestApp();
    const res = await post(app, '/products').send({ title: '의자', price: 0, idempotencyKey: randomUUID() });
    expect(res.status).toBe(401);
  });

  it('[AC-CM-11] 규칙을 어긴 칸 전부를 fields로 알려준다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const res = await create(app, seller.cookie, { title: '가', price: -5 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['price', 'title']);
    expect(await db.product.count()).toBe(0);
  });

  it('[AC-PC-08, 09] 같은 멱등 키로 다시 보내면 기존 상품을 200으로 돌려주고 중복되지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const idempotencyKey = randomUUID();
    const first = await create(app, seller.cookie, { idempotencyKey });
    const second = await create(app, seller.cookie, { idempotencyKey, title: '다른 제목' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.product.id).toBe(first.body.product.id);
    expect(second.body.product.title).toBe('원목 의자');

    // 동시에 들어와도 하나만 만들어진다
    const key = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => create(app, seller.cookie, { idempotencyKey: key })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.product.id)).size).toBe(1);
    expect(await db.product.count()).toBe(2);
  });

  it('[AC-PC-17] 업로드한 사진이 보낸 순서대로 붙고, 임시 업로드 행은 사라진다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const [a, b] = [await makeUpload(seller.id), await makeUpload(seller.id, { width: 800, height: 1600 })];
    const res = await create(app, seller.cookie, { imageIds: [b.id, a.id] });
    expect(res.status).toBe(201);
    expect(res.body.product.images.map((image: { url: string }) => image.url)).toEqual([b.url, a.url]);
    expect(res.body.product.images[0]).toMatchObject({ width: 800, height: 1600, thumbnailUrl: b.thumbnailUrl });
    expect(await db.upload.count()).toBe(0);
  });

  it('[AC-PC-18] 남이 올린 사진을 붙이면 403이고 아무것도 만들어지지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    const upload = await makeUpload(other.id);
    const res = await create(app, seller.cookie, { imageIds: [upload.id] });
    expect(res.status).toBe(403);
    expect(await db.product.count()).toBe(0);
    expect(await db.upload.count()).toBe(1);
  });

  it('같은 업로드를 동시에 두 상품에 붙이면 하나만 성공한다 — 파일 하나를 두 상품이 나눠 갖지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    for (let round = 0; round < 5; round += 1) {
      const upload = await makeUpload(seller.id);
      const results = await Promise.all([1, 2, 3].map(() => create(app, seller.cookie, { imageIds: [upload.id] })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
      expect(await db.productImage.count({ where: { storageKey: upload.storageKey } })).toBe(1);
    }
    // 실패한 요청은 상품도 남기지 않는다
    expect(await db.product.count()).toBe(5);
  });

  it('[AC-PC-19] 없는 업로드 · 24시간 지난 업로드 · 아바타용 업로드는 "사진을 다시 올려 주세요"다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const old = await makeUpload(seller.id, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    const avatar = await makeUpload(seller.id, { kind: 'AVATAR' });
    for (const id of ['missing', old.id, avatar.id]) {
      const res = await create(app, seller.cookie, { imageIds: [id] });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toEqual({ imageIds: '사진을 다시 올려 주세요' });
    }
  });

  it('[AC-CM-32] 한 사용자의 31번째 등록은 429다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    for (let i = 0; i < 30; i += 1) expect((await create(app, seller.cookie)).status).toBe(201);
    expect((await create(app, seller.cookie)).status).toBe(429);
    // 다른 사용자는 막히지 않는다
    expect((await create(app, other.cookie)).status).toBe(201);
  });
});

describe('GET /products', () => {
  async function seed(app: App, cookie: string, count: number) {
    const ids: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const res = await create(app, cookie, { title: `상품 ${String(i).padStart(2, '0')}` });
      ids.push(res.body.product.id as string);
    }
    return ids;
  }

  it('[AC-PL-01, 03] 최신순 20개와 다음 커서를 주고, 커서로 이어 받으면 겹치거나 빠지지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const ids = await seed(app, seller.cookie, 25);
    // 같은 시각에 만들어진 행이 있어도 id로 갈라 순서가 안정적인지 본다
    await db.product.updateMany({ where: { id: { in: ids.slice(8, 14) } }, data: { createdAt: new Date('2026-11-01T00:00:00Z') } });

    const first = productPageSchema.parse((await request(app).get('/products')).body);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = productPageSchema.parse(
      (await request(app).get('/products').query({ cursor: first.nextCursor ?? '' })).body,
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const all = [...first.items, ...second.items];
    expect(new Set(all.map((item) => item.id)).size).toBe(25);
    const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    expect(all.map((item) => item.id)).toEqual(sorted.map((item) => item.id));
  });

  it('[AC-PL-04] limit은 50으로 맞추고, 조작된 커서는 400 INVALID_CURSOR다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    await seed(app, seller.cookie, 3);
    expect((await request(app).get('/products').query({ limit: '2' })).body.items).toHaveLength(2);
    expect((await request(app).get('/products').query({ limit: '9999' })).status).toBe(200);
    for (const cursor of ['garbage', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('["nope","x"]').toString('base64url')]) {
      const res = await request(app).get('/products').query({ cursor });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('[AC-PL-01, 09, 11] 카드는 대표 사진의 썸네일(줄인 크기)과 채팅 수를 담는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const upload = await makeUpload(seller.id);
    const second = await makeUpload(seller.id);
    const product = (await create(app, seller.cookie, { imageIds: [upload.id, second.id] })).body.product;
    await db.chatRoom.create({ data: { productId: product.id, sellerId: seller.id, buyerId: buyer.id } });
    await create(app, seller.cookie, { title: '사진 없는 물건' });

    const { items } = productPageSchema.parse((await request(app).get('/products')).body);
    expect(items[0]).toMatchObject({ title: '사진 없는 물건', thumbnail: null, chatRoomCount: 0 });
    expect(items[1]).toMatchObject({
      thumbnail: { url: upload.thumbnailUrl, width: 400, height: 300 },
      chatRoomCount: 1,
    });
    expect(Object.keys(items[1] ?? {}).sort()).toEqual(['chatRoomCount', 'createdAt', 'id', 'price', 'status', 'thumbnail', 'title']);
  });

  it('[AC-PL-12] 제목을 대소문자 구분 없이 찾고, % · _는 글자 그대로 찾는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    for (const title of ['Apple 맥북', '100% 원목 의자', '원목_책상', '플라스틱 의자']) await create(app, seller.cookie, { title });
    const search = async (q: string) =>
      ((await request(app).get('/products').query({ q })).body.items as { title: string }[]).map((item) => item.title).sort();
    expect(await search('apple')).toEqual(['Apple 맥북']);
    expect(await search('의자')).toEqual(['100% 원목 의자', '플라스틱 의자']);
    expect(await search('0%')).toEqual(['100% 원목 의자']);
    expect(await search('목_')).toEqual(['원목_책상']);
    expect(await search('%%')).toEqual([]);
    expect(await search('__')).toEqual([]);

    const short = await request(app).get('/products').query({ q: '가' });
    expect(short.status).toBe(400);
    expect(short.body.error.fields).toEqual({ q: '2자 이상 입력해 주세요' });
  });

  it('[AC-PL-02, 13] 모든 상태를 포함하고, hideSold=1이면 거래완료를 뺀다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const ids = await seed(app, seller.cookie, 3);
    await patch(app, `/products/${ids[0]}/status`, seller.cookie).send({ status: 'SOLD' });
    await patch(app, `/products/${ids[1]}/status`, seller.cookie).send({ status: 'RESERVED' });
    expect((await request(app).get('/products')).body.items).toHaveLength(3);
    const visible = (await request(app).get('/products').query({ hideSold: '1' })).body.items as { status: string }[];
    expect(visible.map((item) => item.status).sort()).toEqual(['ON_SALE', 'RESERVED']);
  });

  it('[AC-PL-16, AC-PX-06] 삭제된 상품은 목록 · 검색 · 상세 어디에도 없다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const [keep, gone] = await seed(app, seller.cookie, 2);
    expect((await del(app, `/products/${gone}`, seller.cookie)).status).toBe(204);
    const items = (await request(app).get('/products')).body.items as { id: string }[];
    expect(items.map((item) => item.id)).toEqual([keep]);
    expect((await request(app).get('/products').query({ q: '상품' })).body.items).toHaveLength(1);
    // 판매자 본인에게도 404 [AC-PD-19]
    expect((await request(app).get(`/products/${gone}`).set('Cookie', seller.cookie)).status).toBe(404);
  });
});

describe('GET /products/:id', () => {
  it('[AC-PD-11, 12, 22] 보는 사람에 따라 viewer가 달라지고 응답은 캐시되지 않는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    const room = await db.chatRoom.create({ data: { productId: id, sellerId: seller.id, buyerId: buyer.id } });

    const anonymous = await request(app).get(`/products/${id}`);
    expect(productDetailResponseSchema.parse(anonymous.body).viewer).toBeNull();
    expect(anonymous.headers['cache-control']).toBe('no-store');

    const asSeller = await request(app).get(`/products/${id}`).set('Cookie', seller.cookie);
    expect(asSeller.body.viewer).toEqual({ isSeller: true, existingChatRoomId: null, isFavorite: false });
    expect(asSeller.body.product.chatRoomCount).toBe(1);

    const asBuyer = await request(app).get(`/products/${id}`).set('Cookie', buyer.cookie);
    expect(asBuyer.body.viewer).toEqual({ isSeller: false, existingChatRoomId: room.id, isFavorite: false });
  });

  it('만료 · 변조된 쿠키로 열어도 401이 아니라 비로그인으로 보여준다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    const res = await request(app).get(`/products/${id}`).set('Cookie', 'nb_session=garbage');
    expect(res.status).toBe(200);
    expect(res.body.viewer).toBeNull();
    expect((await request(app).get('/products/nope')).status).toBe(404);
  });
});

describe('PATCH /products/:id', () => {
  it('[AC-PC-32, 34] 보낸 필드만 바꾸고 status는 무시하며, 변경이 없어도 updatedAt은 갱신된다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const before = (await create(app, seller.cookie)).body.product;
    const res = await patch(app, `/products/${before.id}`, seller.cookie).send({ price: 9000, status: 'SOLD' });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ title: '원목 의자', price: 9000, status: 'ON_SALE' });

    const again = await patch(app, `/products/${before.id}`, seller.cookie).send({});
    expect(again.status).toBe(200);
    expect(new Date(again.body.product.updatedAt).getTime()).toBeGreaterThan(new Date(res.body.product.updatedAt).getTime());
    expect(again.body.product.createdAt).toBe(before.createdAt);
  });

  it('[AC-PC-31] 최종 사진 목록대로 삭제 · 추가 · 순서가 정해진다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const uploads = [await makeUpload(seller.id), await makeUpload(seller.id), await makeUpload(seller.id)];
    const product = (await create(app, seller.cookie, { imageIds: uploads.map((u) => u.id) })).body.product;
    const [first, , third] = product.images as { id: string; url: string }[];
    const added = await makeUpload(seller.id);

    const res = await patch(app, `/products/${product.id}`, seller.cookie).send({
      images: [{ uploadId: added.id }, { imageId: third?.id }, { imageId: first?.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body.product.images.map((image: { url: string }) => image.url)).toEqual([added.url, third?.url, first?.url]);
    expect(await db.productImage.count()).toBe(3);
    expect(await db.upload.count()).toBe(0);

    // 사진을 생략하면 그대로, 빈 배열이면 전부 삭제
    expect((await patch(app, `/products/${product.id}`, seller.cookie).send({ title: '새 제목' })).body.product.images).toHaveLength(3);
    expect((await patch(app, `/products/${product.id}`, seller.cookie).send({ images: [] })).body.product.images).toEqual([]);
  });

  it('남의 상품 사진 id · 남의 업로드로는 수정할 수 없다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    const mine = (await create(app, seller.cookie)).body.product;
    const theirs = (await create(app, other.cookie, { imageIds: [(await makeUpload(other.id)).id] })).body.product;
    const stolen = await patch(app, `/products/${mine.id}`, seller.cookie).send({ images: [{ imageId: theirs.images[0].id }] });
    expect(stolen.status).toBe(400);
    const upload = await makeUpload(other.id);
    expect((await patch(app, `/products/${mine.id}`, seller.cookie).send({ images: [{ uploadId: upload.id }] })).status).toBe(403);
    // 실패한 수정은 아무것도 바꾸지 않는다
    expect(await db.productImage.count({ where: { productId: theirs.id } })).toBe(1);
  });

  it('[AC-PC-35] 판매자가 아니면 403, 없거나 삭제됐으면 404다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    expect((await patch(app, `/products/${id}`, other.cookie).send({ price: 1 })).status).toBe(403);
    expect((await patch(app, '/products/nope', seller.cookie).send({ price: 1 })).status).toBe(404);
    await del(app, `/products/${id}`, seller.cookie);
    expect((await patch(app, `/products/${id}`, seller.cookie).send({ price: 1 })).status).toBe(404);
    expect((await db.withDeleted().product.findUniqueOrThrow({ where: { id } })).price).toBe(15000);
  });
});

describe('PATCH /products/:id/status', () => {
  async function setup() {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    const change = (body: Record<string, unknown>, cookie = seller.cookie) => patch(app, `/products/${id}/status`, cookie).send(body);
    return { app, seller, buyer, id, change };
  }

  it('[AC-PD-01] 전이 표대로 바뀌고, 표 밖의 전이는 어떤 전이인지 말하는 409다', async () => {
    const { change } = await setup();
    expect((await change({ status: 'RESERVED' })).body.product.status).toBe('RESERVED');
    expect((await change({ status: 'ON_SALE' })).body.product.status).toBe('ON_SALE');
    const sold = await change({ status: 'SOLD' });
    expect(sold.body.product.status).toBe('SOLD');
    expect(sold.body.product.soldAt).not.toBeNull();

    const blocked = await change({ status: 'RESERVED' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toEqual({
      code: 'INVALID_TRANSITION',
      message: '거래완료에서 예약중(으)로는 바꿀 수 없어요',
      fields: null,
    });
  });

  it('[AC-PD-02] 같은 상태로의 변경은 200이고 아무것도 바뀌지 않는다', async () => {
    const { change } = await setup();
    const first = await change({ status: 'SOLD' });
    const second = await change({ status: 'SOLD' });
    expect(second.status).toBe(200);
    expect(second.body.product.soldAt).toBe(first.body.product.soldAt);
    expect(second.body.product.updatedAt).toBe(first.body.product.updatedAt);
  });

  it('[AC-PD-05, 06] 구매자는 대화 상대만 지정할 수 있고, 판매중으로 되돌리면 구매자 정보가 지워진다', async () => {
    const { change, id, seller, buyer } = await setup();
    const stranger = await change({ status: 'SOLD', buyerId: buyer.id });
    expect(stranger.status).toBe(400);
    expect(stranger.body.error.code).toBe('NOT_A_CHAT_PARTNER');

    await db.chatRoom.create({ data: { productId: id, sellerId: seller.id, buyerId: buyer.id } });
    expect((await change({ status: 'SOLD', buyerId: buyer.id })).status).toBe(200);
    expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({ buyerId: buyer.id, soldPrice: 15000 });

    await change({ status: 'ON_SALE' });
    expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({ buyerId: null, soldAt: null, soldPrice: null });
    expect((await change({ status: 'RESERVED', buyerId: buyer.id })).status).toBe(400);
  });

  it('[AC-PD-07, AC-PX-11] 판매자가 아니면 403, 삭제된 상품은 404다', async () => {
    const { app, change, buyer, seller, id } = await setup();
    expect((await change({ status: 'RESERVED' }, buyer.cookie)).status).toBe(403);
    await del(app, `/products/${id}`, seller.cookie);
    expect((await change({ status: 'RESERVED' })).status).toBe(404);
  });

  it('거래 시점 가격은 갱신되는 행의 가격으로 남고, 그 뒤의 가격 수정은 스냅샷을 바꾸지 않는다', async () => {
    const { app, change, seller, id } = await setup();
    await patch(app, `/products/${id}`, seller.cookie).send({ price: 7000 });
    await change({ status: 'SOLD' });
    expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({ price: 7000, soldPrice: 7000 });
    await patch(app, `/products/${id}`, seller.cookie).send({ price: 9000 });
    expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({ price: 9000, soldPrice: 7000 });
  });

  it('동시에 다른 상태로 바꾸면 하나만 반영되고 나머지는 409다', async () => {
    const { change, id } = await setup();
    await change({ status: 'RESERVED' });
    const results = await Promise.all([change({ status: 'SOLD' }), change({ status: 'ON_SALE' })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = await db.product.findUniqueOrThrow({ where: { id } });
    // 어느 쪽이 이기든 CHECK 제약이 지켜진 상태다
    expect(saved.status === 'SOLD' ? saved.soldAt !== null : saved.soldAt === null).toBe(true);
  });
});

describe('DELETE /products/:id', () => {
  it('[AC-PX-01, 04] 어느 상태에서든 soft delete되고, 다시 지우면 404, 남의 것은 403이다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const other = await signup(app, 'other');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    await patch(app, `/products/${id}/status`, seller.cookie).send({ status: 'SOLD' });

    expect((await del(app, `/products/${id}`, other.cookie)).status).toBe(403);
    expect((await del(app, `/products/${id}`, seller.cookie)).status).toBe(204);
    expect((await del(app, `/products/${id}`, seller.cookie)).status).toBe(404);
    // 행은 남아 있다
    const row = await db.withDeleted().product.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe('SOLD');
  });

  it('[AC-PX-05] 일반 조회에는 삭제 조건이 자동으로 붙고 withDeleted()만 삭제된 행을 본다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    await del(app, `/products/${id}`, seller.cookie);
    expect(await db.product.findUnique({ where: { id } })).toBeNull();
    expect(await db.product.findFirst({ where: { id } })).toBeNull();
    expect(await db.product.findMany()).toEqual([]);
    expect(await db.product.count()).toBe(0);
    expect((await db.product.updateMany({ where: { id }, data: { price: 1 } })).count).toBe(0);
    expect(await db.withDeleted().product.count()).toBe(1);
  });
});

describe('GET /products/:id/chat-partners', () => {
  it('[AC-PD-04] 판매자에게만 이 상품의 대화 상대를 최근 활동순으로 준다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const a = await signup(app, 'buyerA');
    const b = await signup(app, 'buyerB');
    const id = (await create(app, seller.cookie)).body.product.id as string;
    await db.chatRoom.create({ data: { productId: id, sellerId: seller.id, buyerId: a.id, lastMessageAt: new Date('2026-11-01') } });
    await db.chatRoom.create({ data: { productId: id, sellerId: seller.id, buyerId: b.id, lastMessageAt: new Date('2026-11-05') } });

    const res = await request(app).get(`/products/${id}/chat-partners`).set('Cookie', seller.cookie);
    expect(res.body.items.map((item: { user: { nickname: string } }) => item.user.nickname)).toEqual(['buyerB', 'buyerA']);
    expect(res.body.items[0].user.email).toBeUndefined();
    expect((await request(app).get(`/products/${id}/chat-partners`).set('Cookie', a.cookie)).status).toBe(403);
    expect((await request(app).get(`/products/${id}/chat-partners`)).status).toBe(401);
  });
});

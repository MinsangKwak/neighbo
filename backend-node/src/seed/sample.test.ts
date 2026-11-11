import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  chatRoomPageSchema,
  chatRoomResponseSchema,
  checkMessage,
  checkTitle,
  messagePageSchema,
  productPageSchema,
} from '@neighbo/shared-schema';
import { createTestApp, db, post, resetDb, sessionCookie, storage } from '../../test/app.js';
import { loadConfig } from '../config.js';
import { createPasswordHasher } from '../lib/password.js';
import { baseEnv } from '../../test/env.js';
import { DEMO_PRODUCTS, seedDemoAccounts, seedDemoProducts } from './demo.js';
import { drawSeedImages, type SeedImage } from './images.js';
import { SAMPLE_PRODUCTS, SAMPLE_ROOMS, SAMPLE_USERS, seedSample } from './sample.js';

const hasher = await createPasswordHasher(10);
const PASSWORD = 'demo password 1';
let images: SeedImage[];

beforeAll(async () => {
  images = await drawSeedImages(12);
});

beforeEach(async () => {
  await resetDb();
  await seedDemoAccounts(db, hasher, PASSWORD);
});

async function loginAs(app: Parameters<typeof request>[0], email: string) {
  const res = await post(app, '/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

describe('데모 상품 시드', () => {
  it('데모 판매자의 상품 6개를 만든다 — 판매중 3 · 예약중 1 · 거래완료 1 · 나눔 1', async () => {
    await seedDemoProducts(db, storage, images);
    const products = await db.product.findMany({ where: { sellerId: 'demo_seller' } });
    expect(products).toHaveLength(6);
    const paid = products.filter((p) => p.price > 0);
    expect(paid.filter((p) => p.status === 'ON_SALE')).toHaveLength(3);
    expect(paid.filter((p) => p.status === 'RESERVED')).toHaveLength(1);
    expect(products.filter((p) => p.price === 0)).toHaveLength(1);
    const sold = products.filter((p) => p.status === 'SOLD');
    expect(sold).toHaveLength(1);
    expect(sold[0]).toMatchObject({ buyerId: 'demo_buyer', soldPrice: sold[0]?.price });
  });

  it('목록 API가 스키마대로 돌려주고, 대표 사진 파일을 실제로 내려받을 수 있다', async () => {
    await seedDemoProducts(db, storage, images);
    const { app } = createTestApp();
    const list = await request(app).get('/products');
    expect(list.status).toBe(200);
    const body = productPageSchema.parse(list.body);
    expect(body.items).toHaveLength(6);
    const thumbnail = body.items[0]?.thumbnail;
    expect(thumbnail).not.toBeNull();
    const file = await request(app).get(thumbnail?.url ?? '');
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
  });

  it('구매자 데모 계정의 구매 내역에 거래완료 상품이 보인다', async () => {
    await seedDemoProducts(db, storage, images);
    const { app } = createTestApp();
    const cookie = await loginAs(app, 'demo2@neighbo.app');
    const res = await request(app).get('/me/purchases').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual(['demo_p5']);
  });

  it('다시 돌리면 처음 상태로 되돌린다 — 바뀐 제목 · 상태 · 삭제를 되돌리고 등록 시각과 행 수는 그대로다', async () => {
    await seedDemoProducts(db, storage, images);
    const before = await db.product.findUniqueOrThrow({ where: { id: 'demo_p1' } });
    await db.product.update({
      where: { id: 'demo_p1' },
      data: { title: '바뀐 제목', status: 'RESERVED', deletedAt: new Date() },
    });
    await db.productImage.deleteMany({ where: { productId: 'demo_p1' } });

    await seedDemoProducts(db, storage, images, new Date(Date.now() + 86_400_000));
    const after = await db.product.findUniqueOrThrow({ where: { id: 'demo_p1' }, include: { images: true } });
    expect(after).toMatchObject({ title: before.title, status: 'ON_SALE', deletedAt: null });
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.images).toHaveLength(DEMO_PRODUCTS[0]?.photos ?? -1);
    expect(await db.product.count()).toBe(6);
    // 거래완료 시각도 밀리지 않는다
    const sold = await db.product.findUniqueOrThrow({ where: { id: 'demo_p5' } });
    expect(sold.soldAt?.getTime()).toBe(sold.createdAt.getTime() + 20 * 3_600_000);
  });

  it('삭제된 거래완료 상품을 되살릴 때도 거래완료 시각이 처음 값 그대로다', async () => {
    await seedDemoProducts(db, storage, images);
    const before = await db.product.findUniqueOrThrow({ where: { id: 'demo_p5' } });
    await db.product.update({ where: { id: 'demo_p5' }, data: { deletedAt: new Date() } });

    await seedDemoProducts(db, storage, images, new Date(Date.now() + 30 * 86_400_000));
    const after = await db.product.findUniqueOrThrow({ where: { id: 'demo_p5' } });
    expect(after.deletedAt).toBeNull();
    expect(after.soldAt).toEqual(before.soldAt);
    expect(after.createdAt).toEqual(before.createdAt);
  });
});

describe('외부 저장소에서의 시드', () => {
  it('처음에는 사진을 올리고, 다시 돌 때는 이미 있는 사진을 올리지 않는다', async () => {
    const puts: string[] = [];
    const external = {
      put: (key: string) => {
        puts.push(key);
        return Promise.resolve();
      },
      remove: () => Promise.resolve(),
      url: (key: string) => `https://img.example.com/${key}`,
      localDirectory: null,
    };
    await seedDemoProducts(db, external, images);
    const first = puts.length;
    // 사진 10장 × (본문 + 썸네일)
    expect(first).toBe(20);
    await seedDemoProducts(db, external, images);
    expect(puts.length).toBe(first);
    // 사진 행이 지워진 상품만 다시 올린다
    await db.productImage.deleteMany({ where: { productId: 'demo_p3' } });
    await seedDemoProducts(db, external, images);
    expect(puts.slice(first)).toEqual(['products/seed-demo_p3-0.webp', 'products/seed-demo_p3-0.thumb.webp']);
    expect((await db.productImage.findFirstOrThrow({ where: { productId: 'demo_p1' } })).url).toContain('https://img.example.com/');
  });

  it('로컬에서 외부 저장소로 옮기면 사진을 새 위치에 올리고 주소를 바꾼다', async () => {
    await seedDemoProducts(db, storage, images);
    expect((await db.productImage.findFirstOrThrow({ where: { productId: 'demo_p1' } })).url).toContain('/files/');
    const puts: string[] = [];
    const external = {
      put: (key: string) => {
        puts.push(key);
        return Promise.resolve();
      },
      remove: () => Promise.resolve(),
      url: (key: string) => `https://img.example.com/${key}`,
      localDirectory: null,
    };
    await seedDemoProducts(db, external, images);
    expect(puts).toHaveLength(20);
    const rows = await db.productImage.findMany({ where: { productId: { startsWith: 'demo_' } } });
    expect(rows.every((row) => row.url.startsWith('https://img.example.com/'))).toBe(true);
    expect(rows.every((row) => row.thumbnailUrl.startsWith('https://img.example.com/'))).toBe(true);
  });
});

describe('샘플 데이터 시드', () => {
  beforeEach(async () => {
    await seedDemoProducts(db, storage, images);
  });

  it('사용자 10 · 상품 60 · 방 15 · 메시지 300을 만든다', async () => {
    const report = await seedSample(db, storage, images);
    expect(report).toEqual({ skipped: false, users: 10, products: 60, rooms: 15, messages: 300 });
    expect(await db.user.count()).toBe(12);
    expect(await db.product.count()).toBe(66);
    expect(await db.chatRoom.count()).toBe(15);
    expect(await db.message.count()).toBe(300);
  });

  it('정의한 값이 화면의 입력 규칙을 넘지 않고, 경계 조건을 담고 있다', () => {
    for (const product of [...DEMO_PRODUCTS, ...SAMPLE_PRODUCTS]) expect(checkTitle(product.title)).toBeNull();
    expect(SAMPLE_PRODUCTS.some((p) => Array.from(p.title).length === 40)).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => p.price === 100_000_000)).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => p.price === 0)).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => p.photos === 0)).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => p.photos === 10)).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => p.description === '')).toBe(true);
    expect(SAMPLE_PRODUCTS.some((p) => Array.from(p.description).length === 2000)).toBe(true);
    expect(new Set(SAMPLE_PRODUCTS.map((p) => p.status))).toEqual(new Set(['ON_SALE', 'RESERVED', 'SOLD']));
    // 판매자가 자기 물건을 사지 않는다
    expect(SAMPLE_PRODUCTS.every((p) => p.buyerId !== p.sellerId)).toBe(true);
  });

  it('저장한 메시지가 전송 규칙(1,000자)을 넘지 않는다', async () => {
    await seedSample(db, storage, images);
    const messages = await db.message.findMany({ select: { content: true } });
    for (const message of messages) expect(checkMessage(message.content)).toBeNull();
    expect(messages.some((m) => Array.from(m.content).length === 1000)).toBe(true);
  });

  it('샘플 계정으로는 로그인할 수 없다', async () => {
    await seedSample(db, storage, images);
    const { app } = createTestApp();
    for (const password of ['!seed-no-login', PASSWORD]) {
      const res = await post(app, '/auth/login').send({ email: SAMPLE_USERS[0]?.email, password });
      expect(res.status).toBe(401);
    }
  });

  it('구매자 데모 계정의 채팅 목록에 방 9개가 최근 순으로 보이고, 읽지 않은 방 수가 배지와 맞는다', async () => {
    await seedSample(db, storage, images);
    const { app } = createTestApp();
    const cookie = await loginAs(app, 'demo2@neighbo.app');
    const list = await request(app).get('/chat-rooms').set('Cookie', cookie);
    expect(list.status).toBe(200);
    const body = chatRoomPageSchema.parse(list.body);
    expect(body.items).toHaveLength(9);
    expect(body.items[0]?.id).toBe('sample_r_p55');
    const unreadRooms = body.items.filter((room) => room.unreadCount > 0);
    expect(unreadRooms.length).toBeGreaterThan(0);

    const unread = await request(app).get('/me/unread').set('Cookie', cookie);
    expect(unread.body).toEqual({ rooms: unreadRooms.length });
  });

  it('판매자 데모 계정은 상품 하나에 상대가 여럿인 방을 본다', async () => {
    await seedSample(db, storage, images);
    const { app } = createTestApp();
    const cookie = await loginAs(app, 'demo@neighbo.app');
    const list = await request(app).get('/chat-rooms').set('Cookie', cookie);
    const body = chatRoomPageSchema.parse(list.body);
    expect(body.items).toHaveLength(6);
    expect(body.items.filter((room) => room.product.id === 'demo_p1')).toHaveLength(3);
  });

  it('가장 긴 방(120개)을 열고 과거 방향으로 끝까지 넘길 수 있다', async () => {
    await seedSample(db, storage, images);
    const { app } = createTestApp();
    const cookie = await loginAs(app, 'demo2@neighbo.app');
    const detail = await request(app).get('/chat-rooms/sample_r_p55').set('Cookie', cookie);
    expect(detail.status).toBe(200);
    chatRoomResponseSchema.parse(detail.body);

    const seen: number[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const res = await request(app)
        .get('/chat-rooms/sample_r_p55/messages')
        .query(cursor === null ? {} : { before: cursor })
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      const body = messagePageSchema.parse(res.body);
      seen.push(...body.items.map((message) => message.seq));
      cursor = body.nextCursor;
      if (cursor === null) break;
    }
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });

  it('다시 돌려도 행이 늘지 않고, 그 사이 오간 대화와 읽음 위치를 덮어쓰지 않는다', async () => {
    await seedSample(db, storage, images);
    const { chat } = createTestApp();
    const room = SAMPLE_ROOMS[0];
    if (room === undefined) throw new Error('방 정의가 없다');
    await chat.send('demo_buyer', { roomId: room.id, content: '새로 보낸 메시지', tempId: 'live-1' });

    const report = await seedSample(db, storage, images);
    expect(report).toMatchObject({ skipped: false, rooms: 0, messages: 0 });
    expect(await db.chatRoom.count()).toBe(15);
    expect(await db.message.count()).toBe(301);
    const after = await db.chatRoom.findUniqueOrThrow({ where: { id: room.id } });
    expect(after).toMatchObject({ lastSeq: 121, lastMessagePreview: '새로 보낸 메시지' });
  });

  it('샘플 닉네임을 다른 계정이 이미 쓰고 있으면 통째로 건너뛴다', async () => {
    await db.user.create({
      data: { email: 'real@example.com', passwordHash: 'x', nickname: '초록지붕', nicknameLower: '초록지붕' },
    });
    const report = await seedSample(db, storage, images);
    expect(report.skipped).toBe(true);
    expect(await db.product.count()).toBe(6);
  });
});

describe('SEED_SAMPLE 설정', () => {
  it('DEMO_PASSWORD 없이 켜면 부팅에서 멈춘다', () => {
    expect(() => loadConfig({ ...baseEnv, SEED_SAMPLE: '1' })).toThrow(/DEMO_PASSWORD/);
    expect(loadConfig({ ...baseEnv, SEED_SAMPLE: '1', DEMO_PASSWORD: 'demo password 1' }).SEED_SAMPLE).toBe('1');
    expect(() => loadConfig({ ...baseEnv, SEED_SAMPLE: 'yes', DEMO_PASSWORD: 'demo password 1' })).toThrow();
  });
});

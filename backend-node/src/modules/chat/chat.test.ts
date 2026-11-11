import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chatRoomPageSchema,
  chatRoomResponseSchema,
  messagePageSchema,
  socketTokenResponseSchema,
} from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, signup } from '../../../test/app.js';
import { baseEnv } from '../../../test/env.js';
import { verifyToken } from '../../lib/jwt.js';
import { ProductDeletedError } from './service.js';

beforeEach(resetDb);

type Ctx = ReturnType<typeof createTestApp>;
type App = Ctx['app'];


async function createProduct(app: App, cookie: string, title = '원목 의자') {
  const res = await post(app, '/products')
    .set('Cookie', cookie)
    .send({ title, price: 15000, idempotencyKey: randomUUID() });
  return res.body.product.id as string;
}

const open = (app: App, cookie: string, productId: unknown) =>
  post(app, '/chat-rooms').set('Cookie', cookie).send({ productId });
const get = (app: App, path: string, cookie: string) => request(app).get(path).set('Cookie', cookie);
const read = (app: App, roomId: string, cookie: string, seq: unknown) =>
  post(app, `/chat-rooms/${roomId}/read`).set('Cookie', cookie).send({ seq });

// 판매자 · 구매자 · 상품 · 방 하나
async function scene(ctx: Ctx) {
  const seller = await signup(ctx.app, 'seller');
  const buyer = await signup(ctx.app, 'buyer');
  const productId = await createProduct(ctx.app, seller.cookie);
  const res = await open(ctx.app, buyer.cookie, productId);
  return { seller, buyer, productId, roomId: res.body.chatRoom.id as string };
}

const text = (roomId: string, content: string, tempId: string = randomUUID()) => ({ roomId, tempId, content });

describe('POST /chat-rooms', () => {
  it('[AC-PD-12] 남의 상품에 처음 열면 201, 다시 열면 같은 방을 200으로 돌려준다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const productId = await createProduct(app, seller.cookie);

    const first = await open(app, buyer.cookie, productId);
    expect(first.status).toBe(201);
    expect(first.headers['cache-control']).toBe('no-store');
    const { chatRoom } = chatRoomResponseSchema.parse(first.body);
    expect(chatRoom).toMatchObject({
      myRole: 'BUYER',
      partner: { id: seller.id, nickname: 'seller' },
      partnerLastReadSeq: 0,
      product: { id: productId, title: '원목 의자', price: 15000, status: 'ON_SALE', thumbnail: null, deleted: false },
    });
    // 상대의 이메일은 어디에도 없다 [AC-CM-14]
    expect(JSON.stringify(first.body)).not.toContain('@example.com');

    const second = await open(app, buyer.cookie, productId);
    expect(second.status).toBe(200);
    expect(second.body.chatRoom.id).toBe(chatRoom.id);

    // 방을 만들 때 두 사람의 참여 행이 함께 생긴다
    const members = await db.chatRoomMember.findMany({ where: { roomId: chatRoom.id }, orderBy: { role: 'asc' } });
    expect(members.map((m) => [m.userId, m.role, m.lastReadSeq])).toEqual([
      [seller.id, 'SELLER', 0],
      [buyer.id, 'BUYER', 0],
    ]);
  });

  it('[AC-PD-13] 동시에 다섯 번 눌러도 방은 하나다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const productId = await createProduct(app, seller.cookie);

    const results = await Promise.all(Array.from({ length: 5 }, () => open(app, buyer.cookie, productId)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.chatRoom.id)).size).toBe(1);
    expect(await db.chatRoom.count()).toBe(1);
    expect(await db.chatRoomMember.count()).toBe(2);
  });

  it('[AC-PD-14] 자기 상품에는 400 CANNOT_CHAT_OWN_PRODUCT', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const res = await open(app, seller.cookie, await createProduct(app, seller.cookie));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHAT_OWN_PRODUCT');
  });

  it('[AC-PD-20] 거래완료 상품에 새 방은 409, 대화하던 사람은 기존 방으로 들어간다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, productId, roomId } = await scene(ctx);
    const late = await signup(app, 'late');
    await request(app)
      .patch(`/products/${productId}/status`)
      .set('Origin', ORIGIN)
      .set('Cookie', seller.cookie)
      .send({ status: 'SOLD' });

    const refused = await open(app, late.cookie, productId);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PRODUCT_SOLD');

    const again = await open(app, buyer.cookie, productId);
    expect(again.status).toBe(200);
    expect(again.body.chatRoom.id).toBe(roomId);
    expect(again.body.chatRoom.product.status).toBe('SOLD');
  });

  it('[AC-PD-16] 없는 상품 · 삭제된 상품은 404 — 판매자와 대화하던 사람에게도', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, productId } = await scene(ctx);
    expect((await open(app, buyer.cookie, 'nope')).status).toBe(404);

    await request(app).delete(`/products/${productId}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);
    expect((await open(app, buyer.cookie, productId)).status).toBe(404);
    expect((await open(app, seller.cookie, productId)).status).toBe(404);
  });

  it('비로그인은 401, productId가 없으면 400', async () => {
    const { app } = createTestApp();
    expect((await post(app, '/chat-rooms').send({ productId: 'x' })).status).toBe(401);
    const user = await signup(app, 'user');
    const res = await open(app, user.cookie, undefined);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /chat-rooms/:id', () => {
  it('[AC-CH-10] 참여자는 자기 기준의 방 정보를 받는다', async () => {
    const ctx = createTestApp();
    const { seller, buyer, roomId } = await scene(ctx);
    const res = await get(ctx.app, `/chat-rooms/${roomId}`, seller.cookie);
    expect(res.status).toBe(200);
    expect(chatRoomResponseSchema.parse(res.body).chatRoom).toMatchObject({
      id: roomId,
      myRole: 'SELLER',
      partner: { id: buyer.id },
    });
  });

  it('[CH-AU-01] 참여자가 아니면 방 · 메시지 · 읽음 모두 404 — 없는 방과 구별되지 않는다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { roomId } = await scene(ctx);
    const other = await signup(app, 'other');
    for (const id of [roomId, 'nope']) {
      const responses = [
        await get(app, `/chat-rooms/${id}`, other.cookie),
        await get(app, `/chat-rooms/${id}/messages`, other.cookie),
        await read(app, id, other.cookie, 1),
      ];
      expect(responses.map((r) => [r.status, r.body.error.code])).toEqual(Array(3).fill([404, 'NOT_FOUND']));
    }
    expect((await request(app).get(`/chat-rooms/${roomId}`)).status).toBe(401);
  });

  it('[AC-CH-17, 결정 0006] 삭제된 상품의 방도 열람할 수 있고 deleted로 표시된다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, productId, roomId } = await scene(ctx);
    await ctx.chat.send(buyer.id, text(roomId, '아직 있나요?'));
    await request(app).delete(`/products/${productId}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);

    const room = await get(app, `/chat-rooms/${roomId}`, buyer.cookie);
    expect(room.status).toBe(200);
    expect(room.body.chatRoom.product).toMatchObject({ id: productId, title: '원목 의자', deleted: true });
    expect((await get(app, `/chat-rooms/${roomId}/messages`, buyer.cookie)).body.items).toHaveLength(1);
    const list = await get(app, '/chat-rooms', buyer.cookie);
    expect(list.body.items[0].product.deleted).toBe(true);
  });
});

describe('메시지 저장 (T7)', () => {
  it('[AC-CH-06] 번호 · 목록용 복사본 · 보낸 사람의 읽음 위치가 한 번에 바뀌고, 커밋 뒤에 알린다', async () => {
    const ctx = createTestApp();
    const { seller, buyer, roomId } = await scene(ctx);
    const first = await ctx.chat.send(buyer.id, text(roomId, '  안녕하세요\n구매 원해요  '), 'conn-1');
    const second = await ctx.chat.send(seller.id, text(roomId, '네 가능합니다'));
    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(first).toMatchObject({ roomId, senderId: buyer.id, content: '  안녕하세요\n구매 원해요  ' });

    const room = await db.chatRoom.findUniqueOrThrow({ where: { id: roomId }, include: { members: true } });
    expect(room).toMatchObject({ lastSeq: 2, lastMessagePreview: '네 가능합니다', lastMessageSenderId: seller.id });
    expect(room.lastMessageAt?.toISOString()).toBe(second.createdAt);
    const byUser = new Map(room.members.map((m) => [m.userId, m]));
    // 보낸 사람은 자기 메시지까지 읽은 것이다
    expect(byUser.get(buyer.id)?.lastReadSeq).toBe(1);
    expect(byUser.get(seller.id)?.lastReadSeq).toBe(2);
    expect(byUser.get(buyer.id)?.lastActivityAt.toISOString()).toBe(second.createdAt);

    expect(ctx.events.messageCreated).toHaveLength(2);
    expect(ctx.events.messageCreated[0]).toMatchObject({
      message: { id: first.id, seq: 1 },
      receiverId: seller.id,
      originConnectionId: 'conn-1',
      // 미리보기는 한 줄로 [CL-OK-06]
      unread: { total: 1, latest: { roomId, partner: { id: buyer.id, nickname: 'buyer' }, preview: '안녕하세요 구매 원해요', count: 1 } },
    });
    // 답장을 보낸 판매자는 다 읽었고, 구매자에게 읽지 않은 방이 하나 생겼다
    expect(ctx.events.messageCreated[1]).toMatchObject({ receiverId: buyer.id, unread: { total: 1 } });
  });

  it('[AC-CH-04] 같은 tempId로 다시 보내면 처음 저장한 메시지를 돌려주고 다시 알리지 않는다', async () => {
    const ctx = createTestApp();
    const { buyer, roomId } = await scene(ctx);
    const input = text(roomId, '안녕하세요', 'temp-1');
    const first = await ctx.chat.send(buyer.id, input);
    const retry = await ctx.chat.send(buyer.id, { ...input, content: '내용이 달라도' });
    expect(retry).toEqual(first);
    expect(await db.message.count()).toBe(1);
    expect((await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).lastSeq).toBe(1);
    expect(ctx.events.messageCreated).toHaveLength(1);
  });

  it('[AC-CH-04] 같은 tempId가 동시에 다섯 번 와도 메시지는 하나다', async () => {
    const ctx = createTestApp();
    const { buyer, roomId } = await scene(ctx);
    const input = text(roomId, '안녕하세요', 'temp-1');
    const results = await Promise.all(Array.from({ length: 5 }, () => ctx.chat.send(buyer.id, input)));
    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    expect(await db.message.count()).toBe(1);
    expect(ctx.events.messageCreated).toHaveLength(1);
  });

  it('[CH-SEC-07] tempId는 보낸 사람마다 따로 센다', async () => {
    const ctx = createTestApp();
    const { seller, buyer, roomId } = await scene(ctx);
    const a = await ctx.chat.send(buyer.id, text(roomId, '구매자', 'same'));
    const b = await ctx.chat.send(seller.id, text(roomId, '판매자', 'same'));
    expect(a.id).not.toBe(b.id);
    expect([a.seq, b.seq]).toEqual([1, 2]);
  });

  it('[결정 0016] 두 사람이 동시에 20개씩 보내도 번호가 1부터 빈틈 없이 이어진다', async () => {
    const ctx = createTestApp();
    const { seller, buyer, roomId } = await scene(ctx);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => [
        ctx.chat.send(buyer.id, text(roomId, `구매자 ${i}`)),
        ctx.chat.send(seller.id, text(roomId, `판매자 ${i}`)),
      ]).flat(),
    );
    const rows = await db.message.findMany({ where: { roomId }, orderBy: { seq: 'asc' } });
    expect(rows.map((m) => m.seq)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    // 시각도 번호를 따라간다 — 잠금을 얻은 뒤의 시각을 쓰기 때문
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(rows[i - 1]!.createdAt.getTime());
    }
    const room = await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.lastSeq).toBe(40);
    expect(room.lastMessagePreview).toBe(rows[39]!.content);
  });

  it('[결정 0016] 늦게 커밋된 메시지도 먼저 커밋된 번호 뒤에서 빠지지 않는다', async () => {
    const ctx = createTestApp();
    const { seller, buyer, roomId, productId } = await scene(ctx);
    // 상품 행을 잡고 있는 트랜잭션(삭제 흉내)이 끝날 때까지 첫 전송은 기다린다
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const early = ctx.chat.send(buyer.id, text(roomId, '먼저 시작'));
    const late = ctx.chat.send(seller.id, text(roomId, '나중에 시작'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await db.message.count()).toBe(0);
    release();
    await blocker;
    const [a, b] = await Promise.all([early, late]);
    expect([a.seq, b.seq].sort()).toEqual([1, 2]);
    // 어느 쪽이 1번이든, 1번 뒤를 물으면 2번이 온다
    const { missed } = await ctx.chat.missedSince(roomId, 1);
    expect(missed.map((m) => m.seq)).toEqual([2]);
  });

  it('[AC-CH-30] 참여자가 아니면 FORBIDDEN이고 아무것도 저장되지 않는다', async () => {
    const ctx = createTestApp();
    const { roomId } = await scene(ctx);
    const other = await signup(ctx.app, 'other');
    await expect(ctx.chat.send(other.id, text(roomId, '끼어들기'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(ctx.chat.send(other.id, text('nope', '없는 방'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.message.count()).toBe(0);
    expect(ctx.events.messageCreated).toHaveLength(0);
  });

  it('[AC-CH-18] 예약중 · 거래완료 상품의 방에는 보낼 수 있고, 삭제된 상품의 방에는 보낼 수 없다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, productId, roomId } = await scene(ctx);
    const status = (next: string) =>
      request(app).patch(`/products/${productId}/status`).set('Origin', ORIGIN).set('Cookie', seller.cookie).send({ status: next });

    await status('RESERVED');
    await ctx.chat.send(buyer.id, text(roomId, '예약중에도'));
    await status('SOLD');
    await ctx.chat.send(buyer.id, text(roomId, '거래 뒤에도'));

    await request(app).delete(`/products/${productId}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);
    await expect(ctx.chat.send(buyer.id, text(roomId, '삭제 뒤'))).rejects.toBeInstanceOf(ProductDeletedError);
    await expect(ctx.chat.send(seller.id, text(roomId, '판매자도'))).rejects.toBeInstanceOf(ProductDeletedError);
    expect(await db.message.count()).toBe(2);
    expect((await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).lastSeq).toBe(2);
  });

  it('[AC-NT-06] 5초 안에 이어 보낸 메시지 수를 알림에 싣는다', async () => {
    const ctx = createTestApp();
    const { buyer, roomId } = await scene(ctx);
    for (const content of ['하나', '둘', '셋']) await ctx.chat.send(buyer.id, text(roomId, content));
    expect(ctx.events.messageCreated.map((e) => e.unread.latest?.count)).toEqual([1, 2, 3]);
    // 방은 하나이므로 배지는 계속 1이다 [결정 0008]
    expect(ctx.events.messageCreated.map((e) => e.unread.total)).toEqual([1, 1, 1]);
  });
});

describe('GET /chat-rooms/:id/messages', () => {
  it('[AC-CH-10, 11] 최신부터 주고 before 커서로 과거를 이어 받는다', async () => {
    const ctx = createTestApp();
    const { buyer, seller, roomId } = await scene(ctx);
    for (let i = 1; i <= 7; i += 1) await ctx.chat.send(i % 2 ? buyer.id : seller.id, text(roomId, `메시지 ${i}`));

    const first = await get(ctx.app, `/chat-rooms/${roomId}/messages?limit=3`, buyer.cookie);
    const page1 = messagePageSchema.parse(first.body);
    expect(page1.items.map((m) => m.seq)).toEqual([7, 6, 5]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = (await get(ctx.app, `/chat-rooms/${roomId}/messages?limit=3&before=${page1.nextCursor}`, buyer.cookie)).body;
    expect(page2.items.map((m: { seq: number }) => m.seq)).toEqual([4, 3, 2]);
    const page3 = (await get(ctx.app, `/chat-rooms/${roomId}/messages?limit=3&before=${page2.nextCursor}`, buyer.cookie)).body;
    expect(page3.items.map((m: { seq: number }) => m.seq)).toEqual([1]);
    expect(page3.nextCursor).toBeNull();
  });

  it('딱 한 페이지 분량이면 다음 커서가 없고, 조작된 커서는 400 INVALID_CURSOR', async () => {
    const ctx = createTestApp();
    const { buyer, roomId } = await scene(ctx);
    for (let i = 1; i <= 3; i += 1) await ctx.chat.send(buyer.id, text(roomId, `메시지 ${i}`));
    const exact = await get(ctx.app, `/chat-rooms/${roomId}/messages?limit=3`, buyer.cookie);
    expect(exact.body.nextCursor).toBeNull();
    const empty = await get(ctx.app, `/chat-rooms/${roomId}/messages?before=${Buffer.from('[1]').toString('base64url')}`, buyer.cookie);
    expect(empty.body).toEqual({ items: [], nextCursor: null });

    for (const cursor of ['zzz', Buffer.from('[-1]').toString('base64url'), Buffer.from('["1"]').toString('base64url')]) {
      const res = await get(ctx.app, `/chat-rooms/${roomId}/messages?before=${cursor}`, buyer.cookie);
      expect([res.status, res.body.error?.code]).toEqual([400, 'INVALID_CURSOR']);
    }
  });

  it('[AC-CH-05] 누락분은 오래된 순으로 100개까지, 더 있으면 hasMore', async () => {
    const ctx = createTestApp();
    const { buyer, roomId } = await scene(ctx);
    await db.message.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({ roomId, senderId: buyer.id, seq: i + 1, content: `m${i + 1}`, tempId: `t${i + 1}` })),
    });
    const all = await ctx.chat.missedSince(roomId, 0);
    expect(all.missed).toHaveLength(100);
    expect([all.missed[0]?.seq, all.missed[99]?.seq, all.hasMore]).toEqual([1, 100, true]);
    const tail = await ctx.chat.missedSince(roomId, 100);
    expect([tail.missed.map((m) => m.seq), tail.hasMore]).toEqual([[101, 102, 103, 104, 105], false]);
    expect(await ctx.chat.missedSince(roomId, 105)).toEqual({ missed: [], hasMore: false });
  });
});

describe('읽음 (T8)', () => {
  it('[AC-CH-01] 뒤로 가지 않고, 없는 번호를 앞질러 찍지 않는다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, roomId } = await scene(ctx);
    for (let i = 1; i <= 3; i += 1) await ctx.chat.send(buyer.id, text(roomId, `메시지 ${i}`));

    expect((await read(app, roomId, seller.cookie, 2)).body).toEqual({ lastReadSeq: 2 });
    // 순서가 뒤바뀌어 도착한 예전 읽음
    expect((await read(app, roomId, seller.cookie, 1)).body).toEqual({ lastReadSeq: 2 });
    // 방에 없는 번호
    expect((await read(app, roomId, seller.cookie, 999)).body).toEqual({ lastReadSeq: 3 });
    expect((await read(app, roomId, seller.cookie, 0)).body).toEqual({ lastReadSeq: 3 });

    for (const bad of [-1, 1.5, '2', null]) {
      expect((await read(app, roomId, seller.cookie, bad)).status).toBe(400);
    }
  });

  it('[AC-CH-02, 40, AC-NT-07] 상대에게는 읽은 위치를, 내 다른 세션에는 줄어든 배지를 알린다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, buyer, roomId } = await scene(ctx);
    await ctx.chat.send(buyer.id, text(roomId, '안녕하세요'));
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 1 });
    expect((await get(app, `/chat-rooms/${roomId}`, buyer.cookie)).body.chatRoom.partnerLastReadSeq).toBe(0);

    await read(app, roomId, seller.cookie, 1);
    expect(ctx.events.roomRead).toEqual([{ roomId, userId: seller.id, lastReadSeq: 1, unreadRooms: 0 }]);
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 0 });
    expect((await get(app, `/chat-rooms/${roomId}`, buyer.cookie)).body.chatRoom.partnerLastReadSeq).toBe(1);
  });
});

describe('GET /chat-rooms', () => {
  it('[AC-CL-01, 02, 03, 14] 내 방만, 최근 활동순으로, 상대 · 역할 · 마지막 메시지 · 읽지 않은 수와 함께', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const other = await signup(app, 'other');
    const chair = await createProduct(app, seller.cookie, '의자');
    const desk = await createProduct(app, seller.cookie, '책상');
    const lamp = await createProduct(app, buyer.cookie, '조명');
    const chairRoom = (await open(app, buyer.cookie, chair)).body.chatRoom.id as string;
    const deskRoom = (await open(app, buyer.cookie, desk)).body.chatRoom.id as string;
    // 구매자가 판매자인 방
    const lampRoom = (await open(app, other.cookie, lamp)).body.chatRoom.id as string;
    // 구매자와 상관없는 방
    await open(app, other.cookie, chair);

    await ctx.chat.send(seller.id, text(chairRoom, '의자 첫 줄\n둘째 줄'));
    await ctx.chat.send(seller.id, text(chairRoom, '의자 둘째'));
    await ctx.chat.send(buyer.id, text(deskRoom, '책상 문의'));

    const res = await get(app, '/chat-rooms', buyer.cookie);
    expect(res.status).toBe(200);
    const page = chatRoomPageSchema.parse(res.body);
    expect(page.items.map((item) => item.id)).toEqual([deskRoom, chairRoom, lampRoom]);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      myRole: 'BUYER',
      partner: { id: seller.id },
      product: { title: '책상' },
      lastMessage: { content: '책상 문의', senderId: buyer.id },
      // 내가 보낸 것은 읽지 않은 수에 들지 않는다
      unreadCount: 0,
    });
    expect(page.items[1]).toMatchObject({ lastMessage: { content: '의자 둘째', senderId: seller.id }, unreadCount: 2 });
    // 메시지가 없는 방
    expect(page.items[2]).toMatchObject({ myRole: 'SELLER', partner: { id: other.id }, lastMessage: null, unreadCount: 0 });
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
    // 배지는 방의 수 [결정 0008]
    expect((await get(app, '/me/unread', buyer.cookie)).body).toEqual({ rooms: 1 });
  });

  it('[AC-CL-01] 커서로 이어 받는 동안 겹치거나 빠지는 방이 없다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const roomIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const productId = await createProduct(app, seller.cookie, `물건 ${i}`);
      roomIds.push((await open(app, buyer.cookie, productId)).body.chatRoom.id as string);
    }
    // 활동 시각이 같은 방이 있어도 id로 가른다
    const at = new Date('2026-11-01T00:00:00Z');
    await db.chatRoomMember.updateMany({ where: { roomId: { in: roomIds.slice(0, 3) } }, data: { lastActivityAt: at } });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(app, `/chat-rooms?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`, buyer.cookie);
      const page = chatRoomPageSchema.parse(res.body);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(roomIds));
    expect((await get(app, '/chat-rooms?cursor=zzz', buyer.cookie)).body.error.code).toBe('INVALID_CURSOR');
  });

  it('[AC-CL-07] productId로 그 상품의 방만 본다 — 판매자에게는 구매자 수만큼', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const { seller, productId } = await scene(ctx);
    const second = await signup(app, 'second');
    await open(app, second.cookie, productId);
    const otherProduct = await createProduct(app, seller.cookie, '책상');
    await open(app, second.cookie, otherProduct);

    const all = await get(app, '/chat-rooms', seller.cookie);
    expect(all.body.items).toHaveLength(3);
    const filtered = await get(app, `/chat-rooms?productId=${productId}`, seller.cookie);
    expect(filtered.body.items).toHaveLength(2);
    expect(filtered.body.items.every((item: { product: { id: string } }) => item.product.id === productId)).toBe(true);
  });

  it('[AC-CL-08] 상품의 대표 사진은 줄인 크기의 썸네일로 실린다', async () => {
    const ctx = createTestApp();
    const { buyer, productId } = await scene(ctx);
    await db.productImage.create({
      data: { productId, storageKey: 'products/a.webp', url: '/api/files/products/a.webp', thumbnailUrl: '/api/files/products/a.thumb.webp', width: 1600, height: 1200, order: 0 },
    });
    const res = await get(ctx.app, '/chat-rooms', buyer.cookie);
    expect(res.body.items[0].product.thumbnail).toEqual({ url: '/api/files/products/a.thumb.webp', width: 400, height: 300 });
  });
});

describe('GET /me/unread', () => {
  it('[AC-NT-01, 09] 비로그인은 401, 삭제된 상품의 방도 센다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    expect((await request(app).get('/me/unread')).status).toBe(401);
    const { seller, buyer, productId, roomId } = await scene(ctx);
    await ctx.chat.send(buyer.id, text(roomId, '안녕하세요'));
    await request(app).delete(`/products/${productId}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);
    const res = await get(app, '/me/unread', seller.cookie);
    expect(res.body).toEqual({ rooms: 1 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('[AC-NT-12] 사용자당 분당 60회를 넘으면 429', async () => {
    const ctx = createTestApp();
    const user = await signup(ctx.app, 'user');
    for (let i = 0; i < 60; i += 1) await get(ctx.app, '/me/unread', user.cookie);
    const res = await get(ctx.app, '/me/unread', user.cookie);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('GET /auth/socket-token', () => {
  it('[AC-LI-18a] 60초짜리 소켓 전용 토큰을 내주고, 세션이 끝나는 시각을 함께 싣는다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const before = Math.floor(Date.now() / 1000);
    const res = await get(app, '/auth/socket-token', user.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { token, expiresAt } = socketTokenResponseSchema.parse(res.body);

    const payload = verifyToken(token, baseEnv.JWT_SECRET, 'socket');
    expect(payload).toMatchObject({ sub: user.id, ver: 0, purpose: 'socket' });
    expect(payload!.exp - payload!.iat).toBe(60);
    expect(Math.abs(new Date(expiresAt).getTime() / 1000 - payload!.exp)).toBeLessThanOrEqual(1);
    // 세션은 7일 — 연결은 이 시각을 넘겨 살지 못한다 (I-11)
    expect(payload!.sxp).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 - 5);
    // 세션 자리에서는 통하지 않는다
    expect(verifyToken(token, baseEnv.JWT_SECRET, 'session')).toBeNull();
    expect((await request(app).get('/me').set('Cookie', `nb_session=${token}`)).status).toBe(401);
  });

  it('비로그인은 401', async () => {
    const { app } = createTestApp();
    expect((await request(app).get('/auth/socket-token')).status).toBe(401);
  });
});

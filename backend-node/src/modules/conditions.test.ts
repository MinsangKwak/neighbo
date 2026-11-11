import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { chatRoomPageSchema, meResponseSchema, productPageSchema, purchasePageSchema } from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, signup, TEST_PASSWORD } from '../../test/app.js';
import { Prisma } from '../generated/prisma/client.js';
import { SOCKET_LIMITS } from '../realtime/socketHub.js';

// 여러 기능에 걸친 공통 조건 — 한 기능의 테스트 파일에 넣기 어려운 것들을 모았다
beforeEach(resetDb);

type Ctx = ReturnType<typeof createTestApp>;
type App = Ctx['app'];
const PASSWORD = TEST_PASSWORD;

const create = (app: App, cookie: string, body: Record<string, unknown>) =>
  post(app, '/products').set('Cookie', cookie).send({ price: 15000, idempotencyKey: randomUUID(), ...body });
const as = (app: App, method: 'patch' | 'delete', path: string, cookie: string) =>
  request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookie);
const get = (app: App, path: string, cookie: string) => request(app).get(path).set('Cookie', cookie);

describe('요청 본문과 응답 모양', () => {
  it('AC-CM-06 본문에 남의 사용자 id를 실어 보내도 토큰의 사용자가 판매자다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');
    const other = await signup(app, 'other');

    const res = await create(app, me.cookie, { title: '내 물건', sellerId: other.id, userId: other.id, id: 'forged' });

    expect(res.status).toBe(201);
    expect(res.body.product.seller.id).toBe(me.id);
    expect(res.body.product.id).not.toBe('forged');
    expect(await db.product.count({ where: { sellerId: other.id } })).toBe(0);
  });

  it('AC-CM-12 성공 응답은 자원을 이름 그대로 담고, 목록은 items와 nextCursor다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');
    const created = await create(app, me.cookie, { title: '원목 의자' });
    expect(Object.keys(created.body as object)).toEqual(['product']);

    const list = await request(app).get('/products?limit=1');
    expect(Object.keys(list.body as object).sort()).toEqual(['items', 'nextCursor']);
    expect(productPageSchema.parse(list.body).nextCursor).toBeNull();

    await create(app, me.cookie, { title: '둘째 물건' });
    const more = productPageSchema.parse((await request(app).get('/products?limit=1')).body);
    expect(more.items).toHaveLength(1);
    expect(more.nextCursor).not.toBeNull();
  });

  it('AC-CM-35 밖으로 나가는 id는 순서를 짐작할 수 없는 cuid다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const first = (await create(app, seller.cookie, { title: '첫 물건' })).body.product.id as string;
    const second = (await create(app, seller.cookie, { title: '둘째 물건' })).body.product.id as string;
    const room = (await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId: first })).body.chatRoom.id as string;

    for (const id of [seller.id, buyer.id, first, second, room]) expect(id).toMatch(/^c[a-z0-9]{20,}$/);
    // 이어서 만든 두 id가 숫자 하나 차이로 이어지지 않는다
    expect(first.slice(-4)).not.toBe(second.slice(-4));
  });
});

describe('입력 저장', () => {
  it('AC-CM-30 태그와 따옴표가 든 입력을 지우거나 바꾸지 않고 원문 그대로 저장한다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');
    const title = '<b>굵게</b> & "따옴표"';
    const description = '<script>alert(1)</script>\n둘째 줄 <img src=x onerror=alert(1)>';

    const res = await create(app, me.cookie, { title, description });

    expect(res.body.product).toMatchObject({ title, description });
    expect(await db.product.findFirstOrThrow({ where: { sellerId: me.id } })).toMatchObject({ title, description });
  });

  it('AC-CM-52 앞뒤 공백과 제로폭 문자를 지운 뒤 검증하고 저장한다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');

    const res = await create(app, me.cookie, { title: '  ​원목​ 의자  ' });
    expect(res.body.product.title).toBe('원목 의자');

    // 지우고 나면 비는 값은 빈 값으로 거절한다
    const blank = await create(app, me.cookie, { title: ' ​ ​ ' });
    expect(blank.status).toBe(400);
    expect(blank.body.error.fields.title).toBe('제목을 입력해 주세요');
  });

  it('AC-PC-36 같은 상품을 잇달아 고치면 둘 다 성공하고 마지막 저장이 남는다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');
    const id = (await create(app, me.cookie, { title: '처음 제목' })).body.product.id as string;

    const first = await as(app, 'patch', `/products/${id}`, me.cookie).send({ title: '먼저 고친 제목', price: 1000 });
    const second = await as(app, 'patch', `/products/${id}`, me.cookie).send({ title: '나중에 고친 제목' });

    expect([first.status, second.status]).toEqual([200, 200]);
    // 나중 요청이 보내지 않은 가격은 먼저 고친 값 그대로다
    expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: '나중에 고친 제목', price: 1000 });
  });
});

describe('가입과 세션', () => {
  it('AC-SU-02 가입 직후에는 상품 0개 · 채팅방 0개 · 기본 아바타다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');

    const body = meResponseSchema.parse((await get(app, '/me', me.cookie)).body);
    expect(body.user.avatarUrl).toBeNull();
    expect(body.counts).toEqual({ onSale: 0, reserved: 0, sold: 0, purchased: 0 });
    expect(chatRoomPageSchema.parse((await get(app, '/chat-rooms', me.cookie)).body).items).toEqual([]);
    expect((await get(app, '/me/unread', me.cookie)).body).toEqual({ rooms: 0 });
  });

  it('AC-LI-04 세션 쿠키는 7일 동안 남는다 — 브라우저를 닫았다 열어도 유지된다', async () => {
    const { app } = createTestApp();
    const me = await signup(app, 'me');
    const login = await post(app, '/auth/login').send({ email: 'me@example.com', password: PASSWORD });

    for (const res of [me.res, login]) {
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
      // 세션 쿠키(Max-Age 없음)가 아니다
      expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
      expect(cookie).not.toContain('Expires=');
    }
  });
});

describe('삭제된 상품이 남기는 것', () => {
  async function tradeThenDelete(sold: boolean) {
    const ctx = createTestApp();
    const { app, chat } = ctx;
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const productId = (await create(app, seller.cookie, { title: '내릴 물건' })).body.product.id as string;
    const roomId = (await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId })).body.chatRoom.id as string;
    await chat.send(buyer.id, { roomId, content: '아직 있나요?', tempId: 't1' });
    if (sold) {
      await as(app, 'patch', `/products/${productId}/status`, seller.cookie).send({ status: 'SOLD', buyerId: buyer.id });
    }
    await as(app, 'delete', `/products/${productId}`, seller.cookie);
    return { app, seller, buyer, productId, roomId };
  }

  it('AC-PX-07 채팅 목록의 행은 남고 상품이 삭제됐다고 알려 준다', async () => {
    const { app, seller, buyer, roomId } = await tradeThenDelete(false);

    for (const who of [seller, buyer]) {
      const rooms = chatRoomPageSchema.parse((await get(app, '/chat-rooms', who.cookie)).body).items;
      expect(rooms.map((room) => room.id)).toEqual([roomId]);
      expect(rooms[0]?.product).toMatchObject({ title: '내릴 물건', deleted: true });
    }
  });

  it('AC-PX-08 방은 열 수 있지만 메시지를 보낼 수 없다', async () => {
    const ctx = createTestApp();
    const { app, chat } = ctx;
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const productId = (await create(app, seller.cookie, { title: '내릴 물건' })).body.product.id as string;
    const roomId = (await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId })).body.chatRoom.id as string;
    await as(app, 'delete', `/products/${productId}`, seller.cookie);

    const room = await get(app, `/chat-rooms/${roomId}`, buyer.cookie);
    expect(room.status).toBe(200);
    // 화면은 이 표시로 입력창을 잠근다
    expect(room.body.chatRoom.product.deleted).toBe(true);
    // 소켓은 이 실패를 PRODUCT_DELETED로 돌려준다 (realtime/socketHub.test.ts)
    await expect(chat.send(buyer.id, { roomId, content: '보내지나요?', tempId: 't2' })).rejects.toMatchObject({
      name: 'ProductDeletedError',
    });
    expect(await db.message.count()).toBe(0);
  });

  it('AC-PX-09 삭제된 상품의 방에 남은 읽지 않은 메시지도 배지에 든다', async () => {
    const { app, seller, buyer } = await tradeThenDelete(false);
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 1 });
    // 보낸 사람 쪽은 읽을 것이 없다
    expect((await get(app, '/me/unread', buyer.cookie)).body).toEqual({ rooms: 0 });
  });

  it('AC-PX-10 거래완료 뒤 삭제해도 구매 내역에 삭제 표시와 함께 남는다', async () => {
    const { app, buyer, productId } = await tradeThenDelete(true);

    const purchases = purchasePageSchema.parse((await get(app, '/me/purchases', buyer.cookie)).body).items;
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ id: productId, title: '내릴 물건', deleted: true, soldPrice: 15000 });
    // 살아 있는 목록에는 없다
    expect(productPageSchema.parse((await request(app).get('/products')).body).items).toEqual([]);
  });
});

describe('두지 않기로 한 것', () => {
  it('AC-NT-03 Notification 표는 없다 — 배지는 방의 번호 두 개로 센다', () => {
    expect(Object.keys(Prisma.ModelName).sort()).toEqual([
      'ChatRoom',
      'ChatRoomMember',
      'Favorite',
      'Message',
      'Product',
      'ProductImage',
      'Upload',
      'User',
    ]);
  });

  it('AC-NT-02 읽지 않은 방의 수는 메시지를 세지 않고 방의 마지막 번호와 내 읽은 번호로 센다', async () => {
    const { app, chat } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const productId = (await create(app, seller.cookie, { title: '원목 의자' })).body.product.id as string;
    const roomId = (await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId })).body.chatRoom.id as string;
    for (let index = 0; index < 3; index += 1) await chat.send(buyer.id, { roomId, content: `메시지 ${index}`, tempId: `t${index}` });

    // 메시지가 셋이어도 방은 하나다
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 1 });
    // 메시지를 지워도(표를 보지 않으므로) 숫자가 그대로다
    await db.message.deleteMany();
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 1 });
    await chat.markRead(seller.id, roomId, 3);
    expect((await get(app, '/me/unread', seller.cookie)).body).toEqual({ rooms: 0 });
  });

  it('AC-CH-43 끊긴 연결은 15초 안에 알아챈다 — 하트비트 10초, 응답 대기 5초', () => {
    expect(SOCKET_LIMITS).toMatchObject({ pingIntervalMs: 10_000, pingTimeoutMs: 5_000 });
  });
});

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MessageSendAck, RoomJoinAck } from '@neighbo/shared-schema';
import { db, ORIGIN, resetDb } from '../../test/app.js';
import { baseEnv } from '../../test/env.js';
import { once, record, settle, socketToken, startRealtime, type Client } from '../../test/realtime.js';
import { signToken } from '../lib/jwt.js';

type Realtime = Awaited<ReturnType<typeof startRealtime>>;

let rt: Realtime;
const started: Realtime[] = [];
async function start(options?: Parameters<typeof startRealtime>[0]) {
  const instance = await startRealtime(options);
  started.push(instance);
  return instance;
}

beforeEach(async () => {
  await resetDb();
  rt = await start();
});
afterEach(async () => {
  await Promise.all(started.splice(0).map((instance) => instance.stop()));
});

async function makeUser(name: string) {
  const user = await db.user.create({
    data: { email: `${name}@example.com`, passwordHash: 'x', nickname: name, nicknameLower: name },
  });
  const session = signToken({ sub: user.id, ver: 0, purpose: 'session' }, baseEnv.JWT_SECRET, 3600);
  return { id: user.id, token: socketToken(user.id), cookie: `nb_session=${session}` };
}

// 판매자 · 구매자 · 상품 · 방 하나
async function scene() {
  const seller = await makeUser('seller');
  const buyer = await makeUser('buyer');
  const product = await db.product.create({
    data: { sellerId: seller.id, title: '원목 의자', price: 15000, idempotencyKey: randomUUID() },
  });
  const { room } = await rt.chat.open(buyer.id, product.id);
  return { seller, buyer, productId: product.id, roomId: room.id };
}

const join = (socket: Client, roomId: unknown, after?: unknown): Promise<RoomJoinAck> =>
  socket.timeout(2000).emitWithAck('room:join', after === undefined ? { roomId } : { roomId, after });

const send = (socket: Client, roomId: string, content: unknown, tempId: string = randomUUID()): Promise<MessageSendAck> =>
  socket.timeout(3000).emitWithAck('message:send', { roomId, tempId, content });

function refused(socket: Client): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('연결되면 안 된다')));
    socket.once('connect_error', (err) => resolve(err.message));
  });
}

const disconnected = (socket: Client) => new Promise<string>((resolve) => socket.once('disconnect', resolve));

describe('연결', () => {
  it('[AC-CH-31] 토큰이 없거나 못 쓰는 토큰이면 핸드셰이크에서 거절한다', async () => {
    const user = await makeUser('user');
    const past = Math.floor(Date.now() / 1000) - 10;
    const bad = {
      '토큰 없음': '',
      '세션 토큰': socketToken(user.id, { purpose: 'session' }),
      '만료된 토큰': socketToken(user.id, { ttl: -10 }),
      '다른 비밀로 서명': socketToken(user.id, { secret: 'another-secret-0123456789-0123456789' }),
      // 세션 만료 시각이 없는 토큰은 연결 중 만료를 판단할 수 없다 (I-11)
      'sxp 없음': socketToken(user.id, { sxp: null }),
      '이미 끝난 세션': socketToken(user.id, { sxp: past }),
      '비밀번호를 바꾸기 전의 토큰': socketToken(user.id, { ver: 7 }),
      '없는 사용자': socketToken('nobody'),
    };
    for (const [name, token] of Object.entries(bad)) {
      expect(await refused(rt.client(token)), name).toBe('UNAUTHORIZED');
    }
    const socket = await rt.connected(user.token);
    expect(socket.connected).toBe(true);
  });

  it('[CH-SEC-06] 허용하지 않은 오리진의 연결은 받지 않는다', async () => {
    const user = await makeUser('user');
    await expect(refused(rt.client(user.token, { origin: 'https://evil.example' }))).resolves.not.toBe('UNAUTHORIZED');
    await expect(refused(rt.client(user.token, { origin: null }))).resolves.toBeTypeOf('string');
  });

  it('[AC-CH-35] long-polling으로도 연결되고 메시지가 오간다', async () => {
    const { seller, buyer, roomId } = await scene();
    const a = await rt.connected(buyer.token, { transports: ['polling'] });
    const b = await rt.connected(seller.token, { transports: ['polling'] });
    await join(a, roomId);
    await join(b, roomId);
    const incoming = once(b, 'message:new');
    expect((await send(a, roomId, '폴링으로')).ok).toBe(true);
    expect((await incoming).message.content).toBe('폴링으로');
  });

  it('[AC-CH-33] 한 사용자의 연결은 5개까지 — 넘으면 가장 오래된 연결을 끊는다', async () => {
    const user = await makeUser('user');
    const first = await rt.connected(user.token);
    const reason = disconnected(first);
    const rest: Client[] = [];
    for (let i = 0; i < 5; i += 1) {
      await settle(5);
      rest.push(await rt.connected(user.token));
    }
    // 서버가 끊은 연결은 자동으로 다시 붙지 않는다 — 재연결 루프가 스스로 멈춘다
    expect(await reason).toBe('io server disconnect');
    await settle();
    expect(rest.every((socket) => socket.connected)).toBe(true);
  });

  it('[AC-CH-31] 연결 중에 세션이 끝나면 UNAUTHORIZED를 알리고 서버가 끊는다', async () => {
    let offset = 0;
    const timed = await start({ now: () => Date.now() + offset });
    const { buyer, roomId } = await scene();
    const socket = await timed.connected(buyer.token);
    expect((await join(socket, roomId)).ok).toBe(true);

    // 소켓 토큰의 수명(60초)이 지나도 연결은 산다 — 보는 것은 세션의 만료다 (I-11)
    offset = 10 * 60 * 1000;
    expect((await send(socket, roomId, '10분 뒤에도')).ok).toBe(true);

    offset = 8 * 24 * 60 * 60 * 1000;
    const error = once(socket, 'error');
    const reason = disconnected(socket);
    socket.emit('room:read', { roomId, seq: 1 });
    expect((await error).code).toBe('UNAUTHORIZED');
    expect(await reason).toBe('io server disconnect');
    expect(await db.message.count()).toBe(1);
  });
});

describe('연결 — 듣기만 하는 연결', () => {
  it('[AC-CH-31] 아무것도 보내지 않아도 세션이 끝나는 순간 서버가 끊는다 — 그 뒤의 메시지를 받지 못한다', async () => {
    const { seller, buyer, roomId } = await scene();
    const sender = await rt.connected(buyer.token);
    await join(sender, roomId);
    // 세션이 1초 뒤에 끝나는 연결. 방에 조인만 하고 듣는다
    const listener = await rt.connected(socketToken(seller.id, { sxp: Math.floor(Date.now() / 1000) + 2 }));
    await join(listener, roomId);
    const received = record(listener, 'message:new');
    const error = once(listener, 'error', 4000);
    const reason = disconnected(listener);

    expect((await error).code).toBe('UNAUTHORIZED');
    expect(await reason).toBe('io server disconnect');
    expect((await send(sender, roomId, '세션이 끝난 뒤')).ok).toBe(true);
    await settle();
    expect(received).toEqual([]);
  });
});

describe('연결 — 세션 무효화', () => {
  it('[AC-MP-09] 비밀번호가 바뀌면 그 사용자의 연결을 모두 이유와 함께 끊는다. 다른 사용자의 연결은 그대로다', async () => {
    const { seller, buyer } = await scene();
    const first = await rt.connected(seller.token);
    const second = await rt.connected(seller.token);
    const other = await rt.connected(buyer.token);
    const errors = [once(first, 'error'), once(second, 'error')];
    const reasons = [disconnected(first), disconnected(second)];

    rt.hub.realtime.userRevoked({ userId: seller.id });
    expect((await Promise.all(errors)).map((error) => error.code)).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(await Promise.all(reasons)).toEqual(['io server disconnect', 'io server disconnect']);
    await settle();
    expect(other.connected).toBe(true);
  });

  it('사용자를 확인하는 사이에 비밀번호가 바뀐 핸드셰이크는 받아 주지 않는다', async () => {
    // 확인 쿼리가 "유효함"을 읽은 뒤, 답이 돌아오기 전에 무효화가 일어나는 순서를 만든다
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow = await start({ isCurrentUser: () => held.then(() => true) });
    const user = await makeUser('user');
    const pending = refused(slow.client(user.token));
    await settle();
    slow.hub.realtime.userRevoked({ userId: user.id });
    release();
    expect(await pending).toBe('UNAUTHORIZED');

    // 무효화 뒤에 시작한 핸드셰이크는 새 답을 읽으므로 평소대로 판단한다
    expect((await slow.connected(user.token)).connected).toBe(true);
  });
});

describe('room:join', () => {
  it('[AC-CH-30] 참여자가 아니면 FORBIDDEN — 없는 방과 같은 답이고, 조인하지 않은 방에는 보낼 수 없다', async () => {
    const { buyer, roomId } = await scene();
    const other = await makeUser('other');
    const outsider = await rt.connected(other.token);
    expect(await join(outsider, roomId)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await join(outsider, 'nope')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await send(outsider, roomId, '끼어들기')).toEqual({ ok: false, code: 'FORBIDDEN', retryAfterMs: null });

    // 참여자여도 조인 전에는 보낼 수 없다
    const member = await rt.connected(buyer.token);
    expect(await send(member, roomId, '조인 전')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await db.message.count()).toBe(0);

    // 방 밖의 사람에게는 그 방의 메시지가 가지 않는다
    const leaked = record(outsider, 'message:new');
    await join(member, roomId);
    expect((await send(member, roomId, '조인 뒤')).ok).toBe(true);
    await settle();
    expect(leaked).toEqual([]);
  });

  it('[AC-CH-32] 모양이 틀린 요청은 INVALID_PAYLOAD로 답하고 연결은 유지한다', async () => {
    const { buyer, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    for (const payload of [null, 'room', {}, { roomId: 1 }, { roomId, after: -1 }, { roomId, after: '3' }]) {
      const ack = await socket.timeout(2000).emitWithAck('room:join', payload);
      expect(ack).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    }
    await join(socket, roomId);
    for (const content of ['', '   \n ', 'x'.repeat(1001), 42, null]) {
      expect(await send(socket, roomId, content)).toEqual({ ok: false, code: 'INVALID_PAYLOAD', retryAfterMs: null });
    }
    const error = once(socket, 'error');
    socket.emit('room:read', { roomId, seq: 'x' });
    expect((await error).code).toBe('INVALID_PAYLOAD');
    expect(socket.connected).toBe(true);
    expect(await db.message.count()).toBe(0);
  });

  it('ack 자리에 함수가 없어도 서버는 멈추지 않는다', async () => {
    const { buyer, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    const raw = socket as unknown as { emit: (event: string, ...args: unknown[]) => void };
    raw.emit('room:join', { roomId });
    raw.emit('room:join', { roomId }, 'not-a-function');
    await settle();
    raw.emit('message:send', { roomId, tempId: 't1', content: '안녕하세요' });
    raw.emit('room:leave', null);
    raw.emit('room:read');
    await settle(300);
    expect((await join(socket, roomId, 0)).ok).toBe(true);
    expect(await db.message.count()).toBe(1);
  });

  it('[AC-CH-05] 다시 붙으면 after 뒤의 메시지를 오래된 순으로 받는다', async () => {
    const { seller, buyer, roomId } = await scene();
    const a = await rt.connected(buyer.token);
    await join(a, roomId);
    let b = await rt.connected(seller.token);
    await join(b, roomId);
    const first = await send(a, roomId, '하나');
    expect(first.ok && first.message.seq).toBe(1);
    await settle();

    // 판매자가 끊긴 동안 세 개가 온다
    b.disconnect();
    for (const content of ['둘', '셋', '넷']) await send(a, roomId, content);

    b = await rt.connected(seller.token);
    const ack = await join(b, roomId, 1);
    expect(ack).toMatchObject({ ok: true, hasMore: false });
    expect(ack.ok && ack.missed.map((m) => [m.seq, m.content])).toEqual([[2, '둘'], [3, '셋'], [4, '넷']]);
    // 처음 들어올 때는 after 없이 — 누락분을 묻지 않는다
    expect(await join(b, roomId)).toEqual({ ok: true, missed: [], hasMore: false });
  });

  it('[AC-CH-36] 서버가 다시 떠도 조인 상태는 DB로 복구된다 — 서버 메모리에 기대지 않는다', async () => {
    const { seller, buyer, roomId } = await scene();
    const b = await rt.connected(seller.token);
    await join(b, roomId);
    const gone = disconnected(b);
    await rt.stop();
    await gone;
    // 판매자가 못 붙은 사이에 저장된 메시지
    await rt.chat.send(buyer.id, { roomId, tempId: 't1', content: '재시작 중에' });

    rt = await start();
    const again = await rt.connected(seller.token);
    // 새 서버는 이 연결이 어느 방에 있었는지 모른다
    expect(await send(again, roomId, '조인 전')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const ack = await join(again, roomId, 0);
    expect(ack.ok && ack.missed.map((m) => m.content)).toEqual(['재시작 중에']);
  });

  it('room:leave 뒤에는 그 방의 상품 변경이 오지 않는다', async () => {
    const { seller, buyer, productId, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    await join(socket, roomId);
    socket.emit('room:leave', { roomId });
    await settle();
    const updates = record(socket, 'room:product_updated');
    await request(rt.app).patch(`/products/${productId}/status`).set('Origin', ORIGIN).set('Cookie', seller.cookie).send({ status: 'RESERVED' });
    await settle();
    expect(updates).toEqual([]);
  });
});

describe('message:send', () => {
  it('[AC-CH-03, 06] 보낸 연결은 ack로, 나머지는 message:new로 한 번씩 받는다', async () => {
    const { seller, buyer, roomId } = await scene();
    const sender = await rt.connected(buyer.token);
    const senderOtherTab = await rt.connected(buyer.token);
    const receiverInRoom = await rt.connected(seller.token);
    // 채팅 목록을 보고 있는 탭 — 방에 조인하지 않았다
    const receiverOnList = await rt.connected(seller.token);
    await Promise.all([join(sender, roomId), join(senderOtherTab, roomId), join(receiverInRoom, roomId)]);

    const got = {
      sender: record(sender, 'message:new'),
      senderOtherTab: record(senderOtherTab, 'message:new'),
      receiverInRoom: record(receiverInRoom, 'message:new'),
      receiverOnList: record(receiverOnList, 'message:new'),
    };
    const badges = { sender: record(sender, 'notification:unread'), receiver: record(receiverOnList, 'notification:unread') };

    const ack = await send(sender, roomId, '  안녕하세요\n\n\n\n구매 원해요  ', 'temp-1');
    expect(ack).toMatchObject({
      ok: true,
      message: { roomId, senderId: buyer.id, seq: 1, tempId: 'temp-1', content: '안녕하세요\n\n구매 원해요' },
    });
    await settle();

    // 보낸 연결에는 다시 가지 않는다 — 같은 말풍선이 두 번 생기지 않게
    expect(got.sender).toEqual([]);
    const message = ack.ok ? ack.message : null;
    expect(got.senderOtherTab).toEqual([{ message }]);
    // 방과 사용자 룸 양쪽에 속한 연결에도 한 번만 간다
    expect(got.receiverInRoom).toEqual([{ message }]);
    expect(got.receiverOnList).toEqual([{ message }]);

    // 배지는 받는 사람에게만 [AC-NT-12]
    expect(badges.sender).toEqual([]);
    expect(badges.receiver).toHaveLength(1);
    expect(badges.receiver[0]).toMatchObject({
      total: 1,
      latest: { roomId, partner: { id: buyer.id, nickname: 'buyer' }, preview: '안녕하세요 구매 원해요', count: 1 },
    });
    expect(JSON.stringify(badges.receiver[0])).not.toContain('@example.com');
  });

  it('[AC-CH-04] 같은 tempId로 다시 보내면 같은 메시지가 ack로 오고 상대는 한 번만 받는다', async () => {
    const { seller, buyer, roomId } = await scene();
    const a = await rt.connected(buyer.token);
    const b = await rt.connected(seller.token);
    await Promise.all([join(a, roomId), join(b, roomId)]);
    const received = record(b, 'message:new');

    const first = await send(a, roomId, '안녕하세요', 'temp-1');
    const retry = await send(a, roomId, '안녕하세요', 'temp-1');
    await settle();
    expect(first.ok && retry.ok && retry.message.id === first.message.id).toBe(true);
    expect(received).toHaveLength(1);
    expect(await db.message.count()).toBe(1);
  });

  it('[AC-CH-33] 한꺼번에 10개까지 받고 그다음은 RATE_LIMITED와 기다릴 시간을 돌려준다', async () => {
    const { buyer, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    await join(socket, roomId);
    const acks = await Promise.all(Array.from({ length: 15 }, (_, i) => send(socket, roomId, `메시지 ${i}`)));
    const limited = acks.filter((ack) => !ack.ok);
    expect(acks.filter((ack) => ack.ok)).toHaveLength(10);
    expect(limited).toHaveLength(5);
    for (const ack of limited) {
      expect(ack).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
      expect(!ack.ok && ack.retryAfterMs).toBeGreaterThan(0);
      expect(!ack.ok && ack.retryAfterMs).toBeLessThanOrEqual(200);
    }
    expect(await db.message.count()).toBe(10);
    // 한도는 연결이 아니라 사용자 기준 — 새 탭을 열어도 풀리지 않는다
    const second = await rt.connected(buyer.token);
    await join(second, roomId);
    const more = await Promise.all(Array.from({ length: 5 }, (_, i) => send(second, roomId, `새 탭 ${i}`)));
    expect(more.some((ack) => !ack.ok && ack.code === 'RATE_LIMITED')).toBe(true);
  });

  it('[AC-CH-32] 가장 무거운 정상 메시지는 통과하고, 한도를 넘는 페이로드는 연결을 끊는다', async () => {
    const { buyer, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    await join(socket, roomId);
    // 4바이트 글자 16,000개 = 64KB
    const heaviest = `😀${'\u{E0100}'.repeat(15_999)}`;
    const ack = await send(socket, roomId, heaviest);
    expect(ack.ok && ack.message.content === heaviest).toBe(true);

    const closed = disconnected(socket);
    socket.emit('room:read', { roomId, seq: 1, padding: 'x'.repeat(100 * 1024) } as never);
    expect(await closed).not.toBe('io client disconnect');
  });

  it('[AC-CH-18, 41] 상품이 바뀌면 방에 알리고, 삭제된 뒤의 전송은 PRODUCT_DELETED로 거절한다', async () => {
    const { seller, buyer, productId, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    await join(socket, roomId);
    const http = (method: 'patch' | 'delete', path: string) =>
      request(rt.app)[method](path).set('Origin', ORIGIN).set('Cookie', seller.cookie);

    let update = once(socket, 'room:product_updated');
    await http('patch', `/products/${productId}/status`).send({ status: 'RESERVED' });
    expect(await update).toMatchObject({ roomId, product: { id: productId, status: 'RESERVED', deleted: false } });

    update = once(socket, 'room:product_updated');
    await http('patch', `/products/${productId}`).send({ price: 9000 });
    expect((await update).product).toMatchObject({ price: 9000, status: 'RESERVED' });
    expect((await send(socket, roomId, '예약중에도 보낼 수 있다')).ok).toBe(true);

    update = once(socket, 'room:product_updated');
    expect((await http('delete', `/products/${productId}`)).status).toBe(204);
    expect((await update).product).toMatchObject({ id: productId, title: '원목 의자', deleted: true });

    expect(await send(socket, roomId, '삭제 뒤')).toEqual({ ok: false, code: 'PRODUCT_DELETED', retryAfterMs: null });
    expect(await db.message.count()).toBe(1);
  });
});

describe('room:read', () => {
  it('[AC-CH-01, 02, 40, AC-CL-15] 상대에게는 읽은 위치가, 내 다른 탭에는 읽은 위치와 줄어든 배지가 간다', async () => {
    const { seller, buyer, roomId } = await scene();
    const a = await rt.connected(buyer.token);
    const reader = await rt.connected(seller.token);
    const readerOtherTab = await rt.connected(seller.token);
    await Promise.all([join(a, roomId), join(reader, roomId)]);
    for (const content of ['하나', '둘', '셋']) await send(a, roomId, content);
    await settle();

    const partner = once(a, 'room:read');
    const otherTab = once(readerOtherTab, 'room:read');
    const badge = once(readerOtherTab, 'notification:unread');
    const partnerBadges = record(a, 'notification:unread');
    // 방에 없는 번호를 보내도 마지막 메시지에서 멈춘다
    reader.emit('room:read', { roomId, seq: 999 });

    const expected = { roomId, userId: seller.id, lastReadSeq: 3 };
    expect(await partner).toEqual(expected);
    expect(await otherTab).toEqual(expected);
    expect(await badge).toEqual({ total: 0, latest: null });
    await settle();
    expect(partnerBadges).toEqual([]);

    // 늦게 도착한 예전 읽음은 위치를 되돌리지 않는다
    const stale = once(a, 'room:read');
    reader.emit('room:read', { roomId, seq: 1 });
    expect((await stale).lastReadSeq).toBe(3);
  });

  it('[AC-CH-30] 참여자가 아닌 방의 읽음은 error FORBIDDEN', async () => {
    const { roomId } = await scene();
    const other = await makeUser('other');
    const socket = await rt.connected(other.token);
    const error = once(socket, 'error');
    socket.emit('room:read', { roomId, seq: 1 });
    expect(await error).toEqual({ code: 'FORBIDDEN', message: '권한이 없어요' });
    expect(socket.connected).toBe(true);
  });
});

describe('HTTP와 한 포트', () => {
  it('소켓 경로가 아닌 요청은 앱이 받고, 소켓 경로의 요청에 앱이 끼어들지 않는다 (I-12)', async () => {
    const health = await fetch(`${rt.url}/healthz`);
    expect([health.status, await health.json()]).toEqual([200, { status: 'ok' }]);
    // 폴링 핸드셰이크 — 앱의 404가 아니라 engine.io의 응답이 한 번만 나간다
    const polling = await fetch(`${rt.url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: ORIGIN } });
    expect(polling.status).toBe(200);
    expect(await polling.text()).toMatch(/^0\{"sid"/);
    expect(polling.headers.get('x-request-id')).toBeNull();
  });
});

describe('로그', () => {
  it('연결과 끊김을 남기고 토큰 · 메시지 본문은 남기지 않는다', async () => {
    const { buyer, roomId } = await scene();
    const socket = await rt.connected(buyer.token);
    await join(socket, roomId);
    await send(socket, roomId, '비밀스러운 내용');
    socket.disconnect();
    await settle();
    const events = rt.lines.filter((line) => line.msg === 'socket').map((line) => line.event);
    expect(events).toEqual(['connected', 'disconnected']);
    const text = JSON.stringify(rt.lines);
    expect(text).toContain(buyer.id);
    expect(text).not.toContain(buyer.token);
    expect(text).not.toContain('비밀스러운');
  });
});

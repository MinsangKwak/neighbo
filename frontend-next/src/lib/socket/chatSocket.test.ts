import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessageSendAck, RoomJoinAck } from '@neighbo/shared-schema';
import { createChatSocket, type SocketHandlers, type SocketLike } from './chatSocket';

// 서버 없이 연결 사건을 흘려 넣는 가짜 소켓
class FakeSocket implements SocketLike {
  connected = false;
  active = true;
  connectCalls = 0;
  emitted: { event: string; payload: unknown }[] = [];
  // ack를 기다리는 전송 — 테스트가 골라서 응답한다
  waiting: { event: string; payload: { roomId: string; tempId?: string; after?: number | null }; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = [];
  private listeners = new Map<string, ((...args: never[]) => void)[]>();

  connect() {
    this.connectCalls += 1;
  }
  disconnect() {
    if (this.connected) this.fire('disconnect', 'io client disconnect');
  }
  on(event: string, listener: (...args: never[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }
  timeout(ms: number) {
    return {
      emitWithAck: (event: string, payload: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          const entry = { event, payload: payload as { roomId: string }, resolve, reject };
          this.waiting.push(entry);
          setTimeout(() => {
            if (this.waiting.includes(entry)) {
              this.waiting.splice(this.waiting.indexOf(entry), 1);
              reject(new Error('operation has timed out'));
            }
          }, ms);
        }),
    };
  }

  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const listener of this.listeners.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args);
  }
  // 기다리는 요청 중 첫 번째에 응답한다
  answer(event: string, result: unknown) {
    const index = this.waiting.findIndex((entry) => entry.event === event);
    if (index === -1) throw new Error(`${event} 요청이 없다`);
    const [entry] = this.waiting.splice(index, 1);
    entry!.resolve(result);
    return entry!.payload;
  }
  sends() {
    return this.waiting.filter((entry) => entry.event === 'message:send').map((entry) => entry.payload.tempId);
  }
}

const message = (seq: number, tempId = `t${seq}`): Message => ({
  id: `m${seq}`,
  roomId: 'room1',
  senderId: 'me',
  seq,
  content: `메시지 ${seq}`,
  tempId,
  createdAt: '2026-11-11T00:00:00.000Z',
});

function setup(token: () => Promise<string | 'unauthorized'> = () => Promise.resolve('token')) {
  const fake = new FakeSocket();
  let authed: { token: string } | null = null;
  const handlers = {
    onMessage: vi.fn(),
    onDelivered: vi.fn(),
    onMissed: vi.fn(),
    onRoomRead: vi.fn(),
    onUnread: vi.fn(),
    onProductUpdated: vi.fn(),
    onReconnected: vi.fn(),
    onFirstConnected: vi.fn(),
    onRoomDenied: vi.fn(),
  } satisfies SocketHandlers;
  const readFallback = vi.fn();
  let id = 0;
  const chat = createChatSocket({
    createSocket: (auth) => {
      auth((data) => (authed = data));
      return fake;
    },
    fetchToken: token,
    readFallback,
    handlers,
    newId: () => `temp-${(id += 1)}`,
  });
  return { chat, fake, handlers, readFallback, authed: () => authed };
}

// 대기 중인 프로미스와 타이머를 함께 흘려보낸다
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('연결 상태', () => {
  it('연결되면 connected, 네트워크로 끊기면 reconnecting, 다시 붙으면 다시 조회를 부른다', async () => {
    const { chat, fake, handlers, authed } = setup();
    expect(chat.getSnapshot().status).toBe('idle');
    chat.connect();
    expect(chat.getSnapshot().status).toBe('connecting');
    await tick();
    // 연결할 때 토큰을 받아 싣는다 [AC-LI-18a]
    expect(authed()).toEqual({ token: 'token' });

    fake.fire('connect');
    await tick();
    expect(chat.getSnapshot()).toMatchObject({ status: 'connected', disconnectedAt: null });
    // 처음 연결은 따로 알린다 — 화면이 먼저 읽어 둔 배지 숫자와 연결 사이의 틈을 메운다
    expect(handlers.onReconnected).not.toHaveBeenCalled();
    expect(handlers.onFirstConnected).toHaveBeenCalledTimes(1);

    fake.fire('disconnect', 'transport close');
    expect(chat.getSnapshot().status).toBe('reconnecting');
    expect(chat.getSnapshot().disconnectedAt).not.toBeNull();

    fake.fire('connect');
    await tick();
    expect(chat.getSnapshot()).toMatchObject({ status: 'connected', disconnectedAt: null });
    expect(handlers.onReconnected).toHaveBeenCalledTimes(1);
    expect(handlers.onFirstConnected).toHaveBeenCalledTimes(1);
  });

  it('[AC-CH-31] 서버가 UNAUTHORIZED를 알리고 끊으면 needs_login — 다시 붙으려 하지 않는다', async () => {
    const { chat, fake } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    fake.fire('error', { code: 'UNAUTHORIZED', message: '로그인이 필요해요' });
    fake.fire('disconnect', 'io server disconnect');
    expect(chat.getSnapshot().status).toBe('needs_login');
    await tick(60_000);
    expect(fake.connectCalls).toBe(0);
  });

  it('[AC-CH-33] 이유 없이 서버가 끊으면(연결 수 초과) paused — 스스로 다시 붙지 않고, 사용자가 다시 연결할 수 있다', async () => {
    const { chat, fake } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    fake.fire('disconnect', 'io server disconnect');
    expect(chat.getSnapshot().status).toBe('paused');
    await tick(60_000);
    expect(fake.connectCalls).toBe(0);
    chat.connect();
    expect(fake.connectCalls).toBe(1);
    expect(chat.getSnapshot().status).toBe('connecting');
  });

  it('[AC-CH-31] 핸드셰이크가 거절되면 needs_login', async () => {
    const { chat, fake } = setup(() => Promise.resolve('unauthorized'));
    chat.connect();
    await tick();
    fake.active = false;
    fake.fire('connect_error', new Error('UNAUTHORIZED'));
    expect(chat.getSnapshot().status).toBe('needs_login');
  });

  it('토큰을 받지 못해 거절된 것은 세션 만료가 아니다 — 잠시 뒤 다시 시도한다', async () => {
    const { chat, fake } = setup(() => Promise.reject(new Error('network')));
    chat.connect();
    await tick();
    fake.active = false;
    fake.fire('connect_error', new Error('UNAUTHORIZED'));
    expect(chat.getSnapshot().status).toBe('connecting');
    await tick(3000);
    expect(fake.connectCalls).toBe(1);
  });

  it('[AC-NT-10] disconnect는 대기열과 조인 기록까지 비운다', async () => {
    const { chat, fake } = setup();
    chat.connect();
    chat.send('room1', '연결 전');
    chat.join('room1', () => 3);
    chat.disconnect();
    expect(chat.getSnapshot()).toEqual({ status: 'idle', disconnectedAt: null, pending: [], sendBlockedUntil: null });
    fake.fire('connect');
    await tick();
    expect(fake.waiting).toEqual([]);
  });
});

describe('방 조인 · 복구', () => {
  it('[AC-CH-05] 조인할 때 받은 마지막 번호를 보내고 누락분을 넘긴다. 다시 붙으면 그때의 번호로 다시 조인한다', async () => {
    const { chat, fake, handlers } = setup();
    let last = 5;
    chat.connect();
    fake.fire('connect');
    await tick();
    chat.join('room1', () => last);
    expect(fake.answer('room:join', { ok: true, missed: [], hasMore: false } satisfies RoomJoinAck)).toEqual({ roomId: 'room1', after: 5 });
    await tick();
    expect(handlers.onMissed).not.toHaveBeenCalled();

    fake.fire('disconnect', 'transport close');
    last = 7;
    fake.fire('connect');
    await tick();
    const missed = [message(8), message(9)];
    expect(fake.answer('room:join', { ok: true, missed, hasMore: true })).toEqual({ roomId: 'room1', after: 7 });
    await tick();
    expect(handlers.onMissed).toHaveBeenCalledWith('room1', missed, true);
  });

  it('[AC-CH-30] 조인이 거절되면 방 단위로 알리고 다시 조인하지 않는다', async () => {
    const { chat, fake, handlers } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    chat.join('room1', () => null);
    fake.answer('room:join', { ok: false, code: 'FORBIDDEN' });
    await tick();
    expect(handlers.onRoomDenied).toHaveBeenCalledWith('room1', 'FORBIDDEN');
    fake.fire('disconnect', 'transport close');
    fake.fire('connect');
    await tick();
    expect(fake.waiting).toEqual([]);
  });

  it('[CH-NW-05] 조인 응답이 없으면 세 번까지 다시 보낸다', async () => {
    const { chat, fake } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    chat.join('room1', () => 1);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(fake.waiting.filter((entry) => entry.event === 'room:join')).toHaveLength(1);
      await tick(5000);
    }
    expect(fake.waiting).toEqual([]);
  });

  it('나간 방은 다시 붙어도 조인하지 않는다', async () => {
    const { chat, fake } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    chat.join('room1', () => 1);
    fake.answer('room:join', { ok: true, missed: [], hasMore: false });
    await tick();
    expect(chat.isJoined('room1')).toBe(true);
    chat.leave('room1');
    expect(chat.isJoined('room1')).toBe(false);
    expect(fake.emitted).toEqual([{ event: 'room:leave', payload: { roomId: 'room1' } }]);
    fake.fire('disconnect', 'transport close');
    fake.fire('connect');
    await tick();
    expect(fake.waiting).toEqual([]);
  });
});

describe('메시지 보내기', () => {
  // 연결하고 room1 화면을 연 상태
  async function connected() {
    const ctx = setup();
    ctx.chat.connect();
    ctx.fake.fire('connect');
    await tick();
    ctx.chat.join('room1', () => 1);
    ctx.fake.answer('room:join', { ok: true, missed: [], hasMore: false });
    await tick();
    return ctx;
  }
  const ok = (seq: number, tempId: string): MessageSendAck => ({ ok: true, message: message(seq, tempId) });

  it('[AC-CH-03] 바로 "전송 중" 말풍선을 만들고, ack가 오면 대기열에서 빼고 저장된 메시지를 넘긴다', async () => {
    const { chat, fake, handlers } = await connected();
    const tempId = chat.send('room1', '안녕하세요');
    expect(chat.getSnapshot().pending).toMatchObject([{ tempId, roomId: 'room1', content: '안녕하세요', status: 'sending' }]);
    expect(fake.waiting[0]?.payload).toEqual({ roomId: 'room1', tempId, content: '안녕하세요' });

    fake.answer('message:send', ok(1, tempId));
    await tick();
    expect(chat.getSnapshot().pending).toEqual([]);
    expect(handlers.onDelivered).toHaveBeenCalledWith(message(1, tempId));
  });

  it('한 번에 하나씩 순서대로 보낸다 — 앞 메시지의 ack 전에는 다음을 내보내지 않는다', async () => {
    const { chat, fake } = await connected();
    const first = chat.send('room1', '하나');
    const second = chat.send('room1', '둘');
    const third = chat.send('room1', '셋');
    expect(fake.sends()).toEqual([first]);

    fake.answer('message:send', ok(1, first));
    await tick();
    // 다음 전송은 200ms 뒤 [AC-CH-33]
    expect(fake.sends()).toEqual([]);
    await tick(200);
    expect(fake.sends()).toEqual([second]);
    fake.answer('message:send', ok(2, second));
    await tick(200);
    expect(fake.sends()).toEqual([third]);
  });

  it('[AC-CH-04, 37] 5초 안에 ack가 없으면 실패로 바꾸고 말풍선은 남긴다. 재시도는 같은 tempId로', async () => {
    const { chat, fake, handlers } = await connected();
    const tempId = chat.send('room1', '안녕하세요');
    await tick(4999);
    expect(chat.getSnapshot().pending[0]?.status).toBe('sending');
    await tick(1);
    expect(chat.getSnapshot().pending).toMatchObject([{ tempId, status: 'failed', failure: '메시지를 보내지 못했어요', content: '안녕하세요' }]);

    chat.retry(tempId);
    expect(chat.getSnapshot().pending[0]).toMatchObject({ status: 'sending', failure: null });
    await tick(200);
    expect(fake.sends()).toEqual([tempId]);
    fake.answer('message:send', ok(1, tempId));
    await tick();
    expect(chat.getSnapshot().pending).toEqual([]);
    expect(handlers.onDelivered).toHaveBeenCalledTimes(1);
  });

  it('실패한 말풍선은 뒤 메시지를 막지 않고, 지우면 서버에 아무것도 보내지 않는다', async () => {
    const { chat, fake } = await connected();
    const first = chat.send('room1', '하나');
    const second = chat.send('room1', '둘');
    fake.answer('message:send', { ok: false, code: 'INTERNAL', retryAfterMs: null });
    await tick(200);
    expect(chat.getSnapshot().pending.map((item) => item.status)).toEqual(['failed', 'sending']);
    expect(fake.sends()).toEqual([second]);
    chat.remove(first);
    expect(chat.getSnapshot().pending.map((item) => item.tempId)).toEqual([second]);
    expect(fake.emitted).toEqual([]);
  });

  it('[AC-CH-38] 끊긴 동안 보낸 메시지는 "연결 중…"으로 기다렸다가, 다시 붙으면 누락분을 받은 뒤 순서대로 간다', async () => {
    const { chat, fake, handlers } = await connected();
    fake.fire('disconnect', 'transport close');

    const first = chat.send('room1', '하나');
    const second = chat.send('room1', '둘');
    expect(chat.getSnapshot().pending.map((item) => item.status)).toEqual(['queued', 'queued']);
    expect(fake.waiting).toEqual([]);

    fake.fire('connect');
    await tick(300);
    // 받기가 끝나기 전에는 보내지 않는다 — 대기 메시지가 놓친 메시지 뒤에 저장되게
    expect(fake.sends()).toEqual([]);
    fake.answer('room:join', { ok: true, missed: [message(2)], hasMore: false });
    await tick();
    expect(handlers.onMissed).toHaveBeenCalled();
    expect(fake.sends()).toEqual([first]);
    fake.answer('message:send', ok(3, first));
    await tick(200);
    expect(fake.sends()).toEqual([second]);
  });

  it('[AC-CH-38] 연결을 기다린 지 30초가 지나면 실패로 바꾼다', async () => {
    const { chat, fake } = await connected();
    fake.fire('disconnect', 'transport close');
    chat.send('room1', '하나');
    await tick(29_999);
    expect(chat.getSnapshot().pending[0]?.status).toBe('queued');
    await tick(1);
    expect(chat.getSnapshot().pending[0]).toMatchObject({ status: 'failed', failure: '메시지를 보내지 못했어요' });
  });

  it('보내는 중에 끊기면 "연결 중…"으로 돌아가고, 다시 붙으면 같은 tempId로 보낸다. 늦게 온 옛 타임아웃은 무시한다', async () => {
    const { chat, fake } = await connected();
    const tempId = chat.send('room1', '안녕하세요');
    await tick(1000);
    fake.fire('disconnect', 'transport close');
    expect(chat.getSnapshot().pending[0]?.status).toBe('queued');

    fake.fire('connect');
    await tick();
    fake.answer('room:join', { ok: true, missed: [], hasMore: false });
    await tick(200);
    expect(fake.sends()).toEqual([tempId, tempId]);
    // 첫 전송의 5초 타임아웃이 지나도 실패로 바뀌지 않는다
    await tick(4000);
    expect(chat.getSnapshot().pending[0]?.status).toBe('sending');
    fake.answer('message:send', ok(1, tempId));
    await tick();
    expect(chat.getSnapshot().pending).toEqual([]);
  });

  it('[AC-CH-30] 화면이 열려 있지 않은 방으로 보낼 때는 먼저 조인하고, 다 보내면 나간다', async () => {
    const { chat, fake, handlers } = await connected();
    const tempId = chat.send('room2', '다른 방으로');
    // 서버는 조인하지 않은 방으로의 전송을 거절한다 — 누락분은 묻지 않고 조인만 한다
    expect(fake.sends()).toEqual([]);
    expect(fake.answer('room:join', { ok: true, missed: [], hasMore: false })).toEqual({ roomId: 'room2', after: null });
    await tick();
    expect(fake.sends()).toEqual([tempId]);
    fake.answer('message:send', { ok: true, message: { ...message(1, tempId), roomId: 'room2' } });
    await tick();
    expect(handlers.onDelivered).toHaveBeenCalled();
    expect(fake.emitted).toEqual([{ event: 'room:leave', payload: { roomId: 'room2' } }]);
  });

  it('[AC-CH-38] 끊긴 동안 쓰고 다른 화면으로 가도, 다시 붙으면 그 방에 조인해서 보낸다', async () => {
    const { chat, fake } = await connected();
    fake.fire('disconnect', 'transport close');
    const tempId = chat.send('room1', '끊긴 동안');
    // 채팅방 화면을 떠났다
    chat.leave('room1');
    expect(chat.getSnapshot().pending[0]?.status).toBe('queued');

    fake.fire('connect');
    await tick();
    expect(fake.answer('room:join', { ok: true, missed: [], hasMore: false })).toEqual({ roomId: 'room1', after: null });
    await tick();
    expect(fake.sends()).toEqual([tempId]);
    fake.answer('message:send', ok(2, tempId));
    await tick();
    expect(chat.getSnapshot().pending).toEqual([]);
    // 보낼 것이 없어진 뒤에야 나간다
    expect(fake.emitted).toEqual([{ event: 'room:leave', payload: { roomId: 'room1' } }]);
  });

  it('보내려는 방의 조인이 거절되면 그 메시지를 실패로 바꾼다', async () => {
    const { chat, fake, handlers } = await connected();
    chat.send('room2', '남의 방');
    fake.answer('room:join', { ok: false, code: 'FORBIDDEN' });
    await tick();
    expect(chat.getSnapshot().pending[0]).toMatchObject({ status: 'failed', failure: '이 채팅방에 보낼 수 없어요' });
    expect(handlers.onRoomDenied).toHaveBeenCalledWith('room2', 'FORBIDDEN');
    expect(fake.sends()).toEqual([]);
  });

  it('[AC-CH-33] RATE_LIMITED는 실패가 아니다 — 알려 준 시간만큼 기다렸다가 같은 메시지를 다시 보낸다', async () => {
    const { chat, fake } = await connected();
    const tempId = chat.send('room1', '안녕하세요');
    fake.answer('message:send', { ok: false, code: 'RATE_LIMITED', retryAfterMs: 800 });
    await tick();
    const snapshot = chat.getSnapshot();
    expect(snapshot.pending[0]).toMatchObject({ tempId, status: 'sending', failure: null });
    expect(snapshot.sendBlockedUntil).not.toBeNull();
    await tick(799);
    expect(fake.sends()).toEqual([]);
    await tick(1);
    expect(fake.sends()).toEqual([tempId]);
    expect(chat.getSnapshot().sendBlockedUntil).toBeNull();
  });

  it('[AC-CH-18] 삭제된 상품의 방이면 실패로 바꾸고 방 단위로 알린다', async () => {
    const { chat, fake, handlers } = await connected();
    chat.send('room1', '안녕하세요');
    fake.answer('message:send', { ok: false, code: 'PRODUCT_DELETED', retryAfterMs: null });
    await tick();
    expect(chat.getSnapshot().pending[0]).toMatchObject({ status: 'failed', failure: '삭제된 물건이라 메시지를 보낼 수 없어요' });
    expect(handlers.onRoomDenied).toHaveBeenCalledWith('room1', 'PRODUCT_DELETED');
  });
});

describe('읽음 · 수신', () => {
  it('[AC-CH-01] 연결돼 있으면 소켓으로, 아니면 HTTP로 읽음을 보낸다', async () => {
    const { chat, fake, readFallback } = setup();
    // HTTP로 시도한 것은 닿았는지 모른다 — false를 돌려주어 다시 붙었을 때 한 번 더 보내게 한다
    expect(chat.read('room1', 3)).toBe(false);
    expect(readFallback).toHaveBeenCalledWith('room1', 3);
    chat.connect();
    fake.fire('connect');
    await tick();
    expect(chat.read('room1', 5)).toBe(true);
    expect(fake.emitted).toEqual([{ event: 'room:read', payload: { roomId: 'room1', seq: 5 } }]);
    expect(readFallback).toHaveBeenCalledTimes(1);
  });

  it('[AC-CH-34] 서버가 보낸 이벤트를 그대로 넘긴다', async () => {
    const { chat, fake, handlers } = setup();
    chat.connect();
    fake.fire('connect');
    await tick();
    fake.fire('message:new', { message: message(1) });
    fake.fire('room:read', { roomId: 'room1', userId: 'u', lastReadSeq: 1 });
    fake.fire('notification:unread', { total: 2, latest: null });
    fake.fire('room:product_updated', { roomId: 'room1', product: { id: 'p' } });
    expect(handlers.onMessage).toHaveBeenCalledWith(message(1));
    expect(handlers.onRoomRead).toHaveBeenCalledWith({ roomId: 'room1', userId: 'u', lastReadSeq: 1 });
    expect(handlers.onUnread).toHaveBeenCalledWith({ total: 2, latest: null });
    expect(handlers.onProductUpdated).toHaveBeenCalled();
  });
});

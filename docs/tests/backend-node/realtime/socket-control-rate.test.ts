import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientToServerEvents, RoomJoinAck, ServerToClientEvents, SocketErrorCode } from '@neighbo/shared-schema';
import { AppError } from '../../../../backend-node/src/errors/AppError.js';
import { signToken } from '../../../../backend-node/src/lib/jwt.js';
import { createLogger } from '../../../../backend-node/src/lib/log.js';
import type { ChatService } from '../../../../backend-node/src/modules/chat/service.js';
import { createSocketHub, SOCKET_LIMITS } from '../../../../backend-node/src/realtime/socketHub.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const ORIGIN = 'http://rate-limit.test';
const SECRET = 'test-socket-rate-limit-secret-0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixture() {
  let now = Date.now();
  const httpServer = createServer((_req, res) => res.end('ok'));
  const chat = {
    isMember: vi.fn(async () => true),
    missedSince: vi.fn(async () => ({ missed: [], hasMore: false })),
    markRead: vi.fn(async (_userId: string, _roomId: string, seq: number) => seq),
    send: vi.fn(async () => { throw new AppError('FORBIDDEN'); }),
  };
  const hub = createSocketHub({
    httpServer,
    jwtSecret: SECRET,
    log: createLogger('error', () => {}),
    isAllowedOrigin: (origin) => origin === ORIGIN,
    isCurrentUser: async () => true,
    now: () => now,
  });
  hub.bind(chat as unknown as ChatService);
  const clients: Client[] = [];
  cleanups.push(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => hub.io.close(() => resolve()));
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;

  async function connect(userId = 'reader') {
    const token = signToken({ sub: userId, ver: 0, purpose: 'socket', sxp: Math.floor(now / 1000) + 3600 }, SECRET, 60);
    const client: Client = io(`http://127.0.0.1:${address.port}`, {
      autoConnect: false,
      auth: { token },
      extraHeaders: { Origin: ORIGIN },
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
      client.connect();
    });
    return client;
  }

  return { chat, connect, advance: (ms: number) => { now += ms; } };
}

const join = (socket: Client): Promise<RoomJoinAck> =>
  socket.timeout(2000).emitWithAck('room:join', { roomId: 'room', after: 0 });

function error(socket: Client): Promise<SocketErrorCode> {
  return new Promise((resolve) => socket.once('error', (event) => resolve(event.code)));
}

describe('소켓 방 입장 · 읽음 사용자별 제한', () => {
  it('방 입장 20개 한도는 같은 사용자의 탭이 공유하며, 다른 사용자와 전송 한도는 분리한다', async () => {
    const { chat, connect, advance } = await fixture();
    const first = await connect();
    const second = await connect();
    const other = await connect('another-reader');
    for (let index = 0; index < SOCKET_LIMITS.joinBurst; index += 1) {
      expect((await join(index % 2 === 0 ? first : second)).ok).toBe(true);
    }
    expect(await join(second)).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(chat.isMember).toHaveBeenCalledTimes(20);
    expect(chat.missedSince).toHaveBeenCalledTimes(20);

    expect((await join(other)).ok).toBe(true);
    const send = await first.timeout(2000).emitWithAck('message:send', { roomId: 'room', tempId: 't1', content: '안녕하세요' });
    expect(send).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(chat.send).toHaveBeenCalledTimes(1);

    advance(199);
    expect(await join(first)).toEqual({ ok: false, code: 'RATE_LIMITED' });
    advance(2);
    expect((await join(first)).ok).toBe(true);
    expect(chat.isMember).toHaveBeenCalledTimes(22);
    expect(chat.missedSince).toHaveBeenCalledTimes(22);
  });

  it('읽음 폭주 100개 중 20개만 서비스에 전달하고 초당 10개씩 다시 허용한다', async () => {
    const { chat, connect, advance } = await fixture();
    const client = await connect();
    const errors: SocketErrorCode[] = [];
    client.on('error', (event) => errors.push(event.code));
    for (let index = 0; index < 100; index += 1) {
      client.emit('room:read', { roomId: 'room', seq: index });
    }
    expect((await join(client)).ok).toBe(true);
    expect(chat.markRead).toHaveBeenCalledTimes(20);
    expect(errors).toHaveLength(80);
    expect(errors.every((code) => code === 'RATE_LIMITED')).toBe(true);

    const sameUser = await connect();
    const blocked = error(sameUser);
    sameUser.emit('room:read', { roomId: 'room', seq: 100 });
    expect(await blocked).toBe('RATE_LIMITED');
    expect(chat.markRead).toHaveBeenCalledTimes(20);

    advance(100);
    sameUser.emit('room:read', { roomId: 'room', seq: 100 });
    expect((await join(sameUser)).ok).toBe(true);
    expect(chat.markRead).toHaveBeenCalledTimes(21);
    const other = await connect('another-reader');
    other.emit('room:read', { roomId: 'room', seq: 1 });
    expect((await join(other)).ok).toBe(true);
    expect(chat.markRead).toHaveBeenCalledTimes(22);
  });

  it('잘못된 입장 입력도 한도를 소비하며 제한 중에는 참여자 확인과 누락 조회를 호출하지 않는다', async () => {
    const { chat, connect } = await fixture();
    const client = await connect();
    for (let index = 0; index < SOCKET_LIMITS.joinBurst; index += 1) {
      expect(await client.timeout(2000).emitWithAck('room:join', null)).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    }
    expect(await join(client)).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(chat.isMember).not.toHaveBeenCalled();
    expect(chat.missedSince).not.toHaveBeenCalled();
    const invalid = error(client);
    client.emit('room:read', null);
    expect(await invalid).toBe('INVALID_PAYLOAD');
    expect(chat.markRead).not.toHaveBeenCalled();
  });
});

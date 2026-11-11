import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@neighbo/shared-schema';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/log.js';
import { createPasswordHasher } from '../src/lib/password.js';
import { signToken } from '../src/lib/jwt.js';
import { createChatService } from '../src/modules/chat/service.js';
import { createOriginCheck } from '../src/middleware/origin.js';
import { createSocketHub } from '../src/realtime/socketHub.js';
import { db, ORIGIN, storage } from './app.js';
import { baseEnv, testConfig } from './env.js';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const hasher = await createPasswordHasher(10);

// 진짜 HTTP 서버 + 진짜 Socket.IO — 운영(server.ts)과 같은 순서로 조립한다
export async function startRealtime(options: { now?: () => number } = {}) {
  const config = testConfig();
  const lines: Record<string, unknown>[] = [];
  const log = createLogger('info', (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  // server.ts와 같은 방식 — 처리기를 서버를 만들 때 넣는다 (I-12)
  let handleHttp: RequestListener = (_req, res) => void res.writeHead(503).end();
  const server = createServer((req, res) => handleHttp(req, res));
  const hub = createSocketHub({
    httpServer: server,
    jwtSecret: config.JWT_SECRET,
    log,
    isAllowedOrigin: createOriginCheck(config.ALLOWED_ORIGIN, config.ALLOWED_ORIGIN_PATTERN),
    isCurrentUser: async (userId, tokenVersion) => {
      const user = await db.user.findUnique({ where: { id: userId } });
      return user !== null && user.tokenVersion === tokenVersion;
    },
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const chat = createChatService(db, hub.realtime);
  hub.bind(chat);
  const app = createApp({ config, log, db, hasher, storage, chat, realtime: hub.realtime, pingDb: () => Promise.resolve() });
  handleHttp = app;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const clients: Client[] = [];

  return {
    app,
    chat,
    hub,
    lines,
    url,
    // 연결을 만들기만 한다 — 연결될 때까지 기다리려면 connected()
    client(token: string, extra: { origin?: string | null; transports?: ('websocket' | 'polling')[] } = {}): Client {
      const origin = extra.origin === undefined ? ORIGIN : extra.origin;
      const socket: Client = connect(url, {
        auth: { token },
        transports: extra.transports ?? ['websocket'],
        reconnection: false,
        forceNew: true,
        ...(origin === null ? {} : { extraHeaders: { Origin: origin } }),
      });
      clients.push(socket);
      return socket;
    },
    async connected(token: string, extra: { origin?: string | null; transports?: ("websocket" | "polling")[] } = {}): Promise<Client> {
      const socket = this.client(token, extra);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    },
    async stop() {
      for (const socket of clients) socket.disconnect();
      await hub.close();
    },
  };
}

// 소켓 토큰 — 기본은 60초짜리, 세션은 7일 남음
export function socketToken(
  userId: string,
  options: { ver?: number; ttl?: number; sxp?: number | null; purpose?: 'socket' | 'session'; secret?: string } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const sxp = options.sxp === undefined ? now + 7 * 24 * 60 * 60 : options.sxp;
  return signToken(
    { sub: userId, ver: options.ver ?? 0, purpose: options.purpose ?? 'socket', ...(sxp === null ? {} : { sxp }) },
    options.secret ?? baseEnv.JWT_SECRET,
    options.ttl ?? 60,
  );
}

// 이벤트 하나를 기다린다. 시간 안에 안 오면 실패
export function once<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
  timeoutMs = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event}가 ${timeoutMs}ms 안에 오지 않았다`)), timeoutMs);
    (socket.once as (event: string, listener: (payload: never) => void) => void)(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// 받은 이벤트를 모아 둔다 — "오지 않았다"를 확인할 때 쓴다
export function record<E extends keyof ServerToClientEvents>(socket: Client, event: E) {
  const received: Parameters<ServerToClientEvents[E]>[0][] = [];
  (socket.on as (event: string, listener: (payload: never) => void) => void)(event, (payload) => received.push(payload));
  return received;
}

export const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

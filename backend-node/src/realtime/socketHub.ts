import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { z } from 'zod';
import {
  messageSendSchema,
  roomJoinSchema,
  roomLeaveSchema,
  roomReadSchema,
  SOCKET_ERROR_MESSAGE,
  type ClientToServerEvents,
  type MessageSendAck,
  type RoomJoinAck,
  type ServerToClientEvents,
  type SocketErrorCode,
} from '@neighbo/shared-schema';
import { AppError } from '../errors/AppError.js';
import { verifyToken } from '../lib/jwt.js';
import type { Logger } from '../lib/log.js';
import { ProductDeletedError, type ChatService } from '../modules/chat/service.js';
import type { Realtime } from './Realtime.js';
import { createTokenBucket } from './tokenBucket.js';

// 근거: docs/architecture/backend.md 09 소켓 서버

interface SocketData {
  userId: string;
  // 이 연결을 연 세션이 끝나는 시각(초). 토큰 자체의 만료(60초)가 아니다 (I-11)
  sessionExp: number;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const SOCKET_LIMITS = {
  // 끊긴 것을 최대 15초 안에 안다. 기본값(25s + 20s)은 "보낸 줄 아는" 시간이 너무 길다 [AC-CH-43]
  pingIntervalMs: 10_000,
  pingTimeoutMs: 5_000,
  // 가장 무거운 정상 메시지가 64KB다 [AC-CH-32, T-05]
  maxPayloadBytes: 80 * 1024,
  // 사용자당 연결 수 — 넘으면 가장 오래된 연결을 끊는다 [AC-CH-33]
  connectionsPerUser: 5,
  // 전송 한도 — 짧은 몰림(10개)은 받고 지속 속도(초당 5개)만 막는다 [AC-CH-33, T-03]
  sendBurst: 10,
  sendPerSecond: 5,
} as const;

const userRoom = (userId: string) => `user:${userId}`;
const chatRoom = (roomId: string) => `room:${roomId}`;

interface SocketHubDeps {
  httpServer: HttpServer;
  jwtSecret: string;
  log: Logger;
  // HTTP의 Origin 검사와 같은 함수 — 목록을 두 군데 두지 않는다 [CH-SEC-06]
  isAllowedOrigin: (origin: string | undefined) => boolean;
  // 토큰이 가리키는 사용자가 지금도 유효한지 (탈퇴 · 비밀번호 변경)
  isCurrentUser: (userId: string, tokenVersion: number) => Promise<boolean>;
  now?: () => number;
}

export function createSocketHub({ httpServer, jwtSecret, log, isAllowedOrigin, isCurrentUser, now = Date.now }: SocketHubDeps) {
  const io: AppServer = new Server(httpServer, {
    pingInterval: SOCKET_LIMITS.pingIntervalMs,
    pingTimeout: SOCKET_LIMITS.pingTimeoutMs,
    maxHttpBufferSize: SOCKET_LIMITS.maxPayloadBytes,
    // WebSocket이 막힌 네트워크에서는 long-polling으로 [AC-CH-35]
    transports: ['websocket', 'polling'],
    // connectionStateRecovery는 켜지 않는다(기본값) — 복구는 DB 커서 한 가지로 한다 [AC-CH-44]
    cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
    // CORS 헤더는 WebSocket 핸드셰이크를 막지 못한다 — 허용하지 않은 오리진의 연결 자체를 거절한다
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
    serveClient: false,
  });

  const bucket = createTokenBucket(SOCKET_LIMITS.sendBurst, SOCKET_LIMITS.sendPerSecond);

  // ── 연결 ───────────────────────────────────────────
  io.use((socket, next) => {
    const refuse = () => {
      // 클라이언트는 이 문자열로 재로그인 화면을 띄운다 [AC-CH-31]
      next(Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } }));
    };
    const token: unknown = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    const payload = typeof token === 'string' ? verifyToken(token, jwtSecret, 'socket', new Date(now())) : null;
    if (payload === null || payload.sxp === undefined || payload.sxp * 1000 <= now()) {
      refuse();
      return;
    }
    isCurrentUser(payload.sub, payload.ver).then(
      (ok) => {
        if (!ok) {
          refuse();
          return;
        }
        socket.data.userId = payload.sub;
        socket.data.sessionExp = payload.sxp as number;
        next();
      },
      (err: unknown) => {
        log.error('socket', { event: 'handshake', error: String(err) });
        next(new Error('INTERNAL'));
      },
    );
  });

  // 가장 오래된 연결부터 끊어 다섯 개만 남긴다. 탭 폭주 · 재연결 루프 버그를 막는다
  function trimConnections(userId: string) {
    const ids = io.sockets.adapter.rooms.get(userRoom(userId));
    if (ids === undefined || ids.size <= SOCKET_LIMITS.connectionsPerUser) return;
    const sockets = [...ids]
      .map((id) => io.sockets.sockets.get(id))
      .filter((s): s is AppSocket => s !== undefined)
      .sort((a, b) => a.handshake.issued - b.handshake.issued);
    for (const old of sockets.slice(0, sockets.length - SOCKET_LIMITS.connectionsPerUser)) {
      log.info('socket', { event: 'evicted', connId: old.id, userId });
      old.disconnect(true);
    }
  }

  function fail(socket: AppSocket, code: SocketErrorCode) {
    socket.emit('error', { code, message: SOCKET_ERROR_MESSAGE[code] });
  }

  // 모든 이벤트의 첫 단계 — 연결 중에 세션이 끝났으면 알리고 끊는다 [AC-CH-31]
  // 서버가 끊은 연결은 자동으로 다시 붙지 않으므로 클라이언트가 재로그인으로 보낸다
  function alive(socket: AppSocket): boolean {
    if (socket.data.sessionExp * 1000 > now()) return true;
    fail(socket, 'UNAUTHORIZED');
    socket.disconnect(true);
    return false;
  }

  function parse<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> | null {
    const result = schema.safeParse(payload);
    return result.success ? result.data : null;
  }

  // ack 자리에 함수가 아닌 값을 보내는 클라이언트가 서버를 죽이지 못하게 한다
  function replier<T>(ack: unknown): (result: T) => void {
    return typeof ack === 'function' ? (ack as (result: T) => void) : () => {};
  }

  function toCode(err: unknown): SocketErrorCode {
    if (err instanceof ProductDeletedError) return 'PRODUCT_DELETED';
    // 참여자가 아니면 방이 없는 것과 같은 답을 준다
    if (err instanceof AppError && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) return 'FORBIDDEN';
    return 'INTERNAL';
  }

  function logFailure(socket: AppSocket, event: string, err: unknown) {
    log.error('socket', { event, connId: socket.id, userId: socket.data.userId, error: String(err) });
  }

  // ── 이벤트 ─────────────────────────────────────────
  function bind(chat: ChatService) {
    io.on('connection', (socket) => {
      const { userId } = socket.data;
      // 알림 · 읽음 동기화는 사용자의 모든 연결로 간다
      void socket.join(userRoom(userId));
      trimConnections(userId);
      log.info('socket', { event: 'connected', connId: socket.id, userId, transport: socket.conn.transport.name });
      socket.on('disconnect', (reason) => {
        log.info('socket', { event: 'disconnected', connId: socket.id, userId, reason });
      });

      socket.on('room:join', (payload, ack) => {
        const reply = replier<RoomJoinAck>(ack);
        if (!alive(socket)) return;
        const input = parse(roomJoinSchema, payload);
        if (input === null) {
          reply({ ok: false, code: 'INVALID_PAYLOAD' });
          return;
        }
        void (async () => {
          if (!(await chat.isMember(userId, input.roomId))) {
            reply({ ok: false, code: 'FORBIDDEN' });
            return;
          }
          // 조인 다음에 조회한다 — 그 사이에 커밋된 메시지가 조회 결과나 message:new 중 하나로 반드시 온다
          await socket.join(chatRoom(input.roomId));
          const { missed, hasMore } =
            input.after === null ? { missed: [], hasMore: false } : await chat.missedSince(input.roomId, input.after);
          reply({ ok: true, missed, hasMore });
        })().catch((err: unknown) => {
          logFailure(socket, 'room:join', err);
          reply({ ok: false, code: 'INTERNAL' });
        });
      });

      socket.on('room:leave', (payload) => {
        const input = parse(roomLeaveSchema, payload);
        if (input !== null) void socket.leave(chatRoom(input.roomId));
      });

      socket.on('message:send', (payload, ack) => {
        const reply = replier<MessageSendAck>(ack);
        if (!alive(socket)) return;
        const waitMs = bucket.take(userId, now());
        if (waitMs > 0) {
          reply({ ok: false, code: 'RATE_LIMITED', retryAfterMs: waitMs });
          return;
        }
        const input = parse(messageSendSchema, payload);
        if (input === null) {
          reply({ ok: false, code: 'INVALID_PAYLOAD', retryAfterMs: null });
          return;
        }
        // 조인하지 않은 방에는 보낼 수 없다 [AC-CH-30]
        if (!socket.rooms.has(chatRoom(input.roomId))) {
          reply({ ok: false, code: 'FORBIDDEN', retryAfterMs: null });
          return;
        }
        chat.send(userId, input, socket.id).then(
          (message) => reply({ ok: true, message }),
          (err: unknown) => {
            const code = toCode(err);
            if (code === 'INTERNAL') logFailure(socket, 'message:send', err);
            reply({ ok: false, code, retryAfterMs: null });
          },
        );
      });

      socket.on('room:read', (payload) => {
        if (!alive(socket)) return;
        const input = parse(roomReadSchema, payload);
        if (input === null) {
          fail(socket, 'INVALID_PAYLOAD');
          return;
        }
        // 결과는 ack가 아니라 room:read 브로드캐스트로 돌아온다
        chat.markRead(userId, input.roomId, input.seq).catch((err: unknown) => {
          const code = toCode(err);
          if (code === 'INTERNAL') logFailure(socket, 'room:read', err);
          fail(socket, code);
        });
      });
    });
  }

  // ── 서비스 → 클라이언트 ────────────────────────────
  // 서비스는 커밋 뒤에만 부른다. 보내다 실패해도 다시 보내지 않는다 — 메시지는 DB에 있고 재연결 복구가 메운다
  const realtime: Realtime = {
    messageCreated({ message, receiverId, unread, originConnectionId }) {
      // 방을 보는 연결 + 두 사람의 다른 화면(목록 · 토스트). 겹치는 연결에는 한 번만 간다
      const targets = io.to([chatRoom(message.roomId), userRoom(message.senderId), userRoom(receiverId)]);
      // 보낸 연결은 ack로 이미 확정했다 — 같은 말풍선이 두 번 생기지 않게 뺀다
      (originConnectionId === null ? targets : targets.except(originConnectionId)).emit('message:new', { message });
      io.to(userRoom(receiverId)).emit('notification:unread', unread);
    },
    roomRead({ roomId, userId, lastReadSeq, unreadRooms }) {
      // 상대는 "읽음" 표시, 내 다른 탭은 그 방의 배지 [AC-CH-02, 40]
      io.to([chatRoom(roomId), userRoom(userId)]).emit('room:read', { roomId, userId, lastReadSeq });
      io.to(userRoom(userId)).emit('notification:unread', { total: unreadRooms, latest: null });
    },
    productUpdated({ roomIds, product }) {
      for (const roomId of roomIds) io.to(chatRoom(roomId)).emit('room:product_updated', { roomId, product });
    },
  };

  return {
    io,
    realtime,
    bind,
    // 연결을 모두 끊고 HTTP 서버까지 닫는다
    close: () => io.close(),
  };
}

export type SocketHub = ReturnType<typeof createSocketHub>;

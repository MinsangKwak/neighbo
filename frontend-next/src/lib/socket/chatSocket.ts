import {
  SEND_ACK_TIMEOUT_MS,
  SOCKET_ERROR_MESSAGE,
  type Message,
  type MessageSendAck,
  type NotificationUnreadEvent,
  type RoomJoinAck,
  type RoomProductUpdatedEvent,
  type RoomReadEvent,
  type SocketErrorCode,
} from '@neighbo/shared-schema';

// 근거: docs/architecture/frontend.md 07 소켓 클라이언트
// React를 모르는 연결 관리자 — 상태 기계 · 전송 대기열 · 복구 절차. 화면은 구독해서 그리기만 한다

export type ConnectionStatus =
  // 연결하지 않음 (비로그인 · 로그아웃)
  | 'idle'
  | 'connecting'
  | 'connected'
  // 끊겼고 자동으로 다시 붙는 중
  | 'reconnecting'
  // 세션이 끝났다 — 다시 로그인해야 한다 [AC-CH-31]
  | 'needs_login'
  // 서버가 이 연결을 정리했다(연결 수 초과). 스스로 다시 붙지 않는다 — 다시 붙으면 다른 탭이 밀려난다
  | 'paused';

export type PendingStatus =
  // 보내는 중이거나 앞 메시지의 ack를 기다리는 중
  | 'sending'
  // 연결이 없어 기다리는 중 — "연결 중…"
  | 'queued'
  | 'failed';

export interface PendingMessage {
  tempId: string;
  roomId: string;
  content: string;
  createdAt: number;
  status: PendingStatus;
  // 실패한 이유 (사용자에게 보일 문구)
  failure: string | null;
}

export interface SocketSnapshot {
  status: ConnectionStatus;
  // 끊긴 시각(ms). 5초 넘으면 화면이 끊김 바를 띄운다 [AC-CH-39]
  disconnectedAt: number | null;
  pending: readonly PendingMessage[];
  // 전송 한도에 걸려 이 시각(ms)까지 보낼 수 없다 [AC-CH-33]
  sendBlockedUntil: number | null;
}

// socket.io-client에서 쓰는 만큼만 — 테스트가 가짜로 바꿔 끼운다
export interface SocketLike {
  connected: boolean;
  // 서버가 거절한 연결은 false — 자동으로 다시 붙지 않는다
  active: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<unknown> };
}

export interface SocketHandlers {
  onMessage(message: Message): void;
  // 내가 보낸 메시지가 저장됐다
  onDelivered(message: Message): void;
  // 조인 응답의 누락분. hasMore면 100개를 넘겨 일부만 온 것이다
  onMissed(roomId: string, missed: Message[], hasMore: boolean): void;
  onRoomRead(event: RoomReadEvent): void;
  onUnread(event: NotificationUnreadEvent): void;
  onProductUpdated(event: RoomProductUpdatedEvent): void;
  // 끊겼다 다시 붙었다 — 끊긴 동안의 변화를 다시 조회할 때
  onReconnected(): void;
  // 참여자가 아닌 방 · 삭제된 상품 등 방 단위의 거절
  onRoomDenied(roomId: string, code: SocketErrorCode): void;
}

export interface ChatSocketOptions {
  // 연결을 만든다. auth는 연결 · 재연결마다 불린다
  createSocket(auth: (callback: (data: { token: string }) => void) => void): SocketLike;
  // 60초짜리 소켓 토큰. 로그인이 풀렸으면 'unauthorized', 그 밖의 실패는 던진다
  fetchToken(): Promise<string | 'unauthorized'>;
  // 소켓이 없을 때의 읽음 [AC-CH-01]
  readFallback(roomId: string, seq: number): void;
  handlers: SocketHandlers;
  now?: () => number;
  newId?: () => string;
}

// 대기열 재전송 · 연속 전송 사이의 간격 — 서버 한도(초당 5개)에 맞춘 값 [AC-CH-33]
export const SEND_GAP_MS = 200;
// 연결을 기다리는 메시지는 이 시간이 지나면 실패로 바꾼다 [AC-CH-38]
export const QUEUE_LIMIT_MS = 30_000;
const JOIN_TIMEOUT_MS = 5000;
const JOIN_ATTEMPTS = 3;
// 토큰을 못 받아 거절당한 연결을 다시 시도하는 간격
const TOKEN_RETRY_MS = 3000;

const SEND_FAILURE: Record<SocketErrorCode | 'TIMEOUT', string> = {
  ...SOCKET_ERROR_MESSAGE,
  FORBIDDEN: '이 채팅방에 보낼 수 없어요',
  INVALID_PAYLOAD: '보낼 수 없는 메시지예요',
  INTERNAL: '메시지를 보내지 못했어요',
  TIMEOUT: '메시지를 보내지 못했어요',
};

export function createChatSocket(options: ChatSocketOptions) {
  const { handlers, readFallback, fetchToken } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());

  let socket: SocketLike | null = null;
  let snapshot: SocketSnapshot = { status: 'idle', disconnectedAt: null, pending: [], sendBlockedUntil: null };
  const listeners = new Set<() => void>();

  // 조인한 방 → 그 방에서 받은 마지막 seq를 알려 주는 함수. 서버 메모리는 재시작으로 사라지므로 여기서 기억한다
  const joined = new Map<string, () => number | null>();
  // 지금 연결에서 서버가 조인을 받아 준 방. 서버는 조인하지 않은 방으로의 전송을 거절한다 [AC-CH-30]
  const serverJoined = new Set<string>();
  // 한 번이라도 연결된 적이 있는지 — 재연결일 때만 다시 조회를 부른다
  let everConnected = false;
  // 마지막 토큰 요청의 결과 — 서버의 거절이 "세션 만료"인지 "토큰을 못 받음"인지 가른다
  let tokenResult: 'ok' | 'unauthorized' | 'failed' = 'ok';
  // 서버가 끊기 직전에 보낸 이유
  let lastServerError: SocketErrorCode | null = null;
  // 지금 ack를 기다리는 전송. 끊기면 비우고, 그 뒤에 도착한 옛 응답(타임아웃 포함)은 버린다
  let inFlight: { tempId: string; turn: number } | null = null;
  let turns = 0;
  let lastEmitAt = 0;
  // 복구(조인 · 누락분)가 끝나기 전에는 보내지 않는다 — 대기 메시지가 놓친 메시지들 뒤에 저장되게
  let recovering = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(ms: number, run: () => void) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  }

  function update(patch: Partial<SocketSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function setStatus(status: ConnectionStatus) {
    if (status === snapshot.status) return;
    const down = status === 'reconnecting' || status === 'paused';
    update({ status, disconnectedAt: down ? (snapshot.disconnectedAt ?? now()) : null });
  }

  function patchPending(tempId: string, patch: Partial<PendingMessage>) {
    update({ pending: snapshot.pending.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)) });
  }

  function dropPending(tempId: string) {
    update({ pending: snapshot.pending.filter((item) => item.tempId !== tempId) });
  }

  // ── 방 조인 · 복구 ─────────────────────────────────
  async function joinRoom(roomId: string, attempt = 1): Promise<void> {
    const current = socket;
    const after = joined.get(roomId);
    if (current === null || !current.connected || after === undefined) return;
    let ack: RoomJoinAck;
    try {
      ack = (await current.timeout(JOIN_TIMEOUT_MS).emitWithAck('room:join', { roomId, after: after() })) as RoomJoinAck;
    } catch {
      // 응답이 없으면 세 번까지 [CH-NW-05]. 그래도 안 되면 다음 재연결이 다시 조인한다
      if (attempt < JOIN_ATTEMPTS && socket === current && current.connected) await joinRoom(roomId, attempt + 1);
      return;
    }
    if (ack.ok && socket === current && current.connected) serverJoined.add(roomId);
    if (!joined.has(roomId)) {
      // 응답을 기다리는 사이에 화면을 떠났다
      releaseRoom(roomId);
      return;
    }
    if (ack.ok) {
      if (ack.missed.length > 0 || ack.hasMore) handlers.onMissed(roomId, ack.missed, ack.hasMore);
    } else {
      joined.delete(roomId);
      handlers.onRoomDenied(roomId, ack.code);
    }
  }

  // 보낼 메시지가 남은 방은 화면을 떠나도 조인을 유지한다 — 끊긴 동안 쓰고 다른 화면으로 간 메시지가 거절되지 않게
  const hasOutgoing = (roomId: string) =>
    snapshot.pending.some((item) => item.roomId === roomId && item.status !== 'failed');

  // 보고 있지도 않고 보낼 것도 없는 방에서 나간다
  function releaseRoom(roomId: string) {
    if (joined.has(roomId) || hasOutgoing(roomId) || !serverJoined.delete(roomId)) return;
    if (socket?.connected === true) socket.emit('room:leave', { roomId });
  }

  // 화면이 열려 있지 않은 방으로 보내기 전에 조인한다. 누락분은 묻지 않는다 — 그 방의 화면은 다시 열릴 때 새로 받는다
  async function joinForSend(roomId: string): Promise<SocketErrorCode | null> {
    const current = socket;
    if (current === null || !current.connected) return 'INTERNAL';
    try {
      const ack = (await current.timeout(JOIN_TIMEOUT_MS).emitWithAck('room:join', { roomId, after: null })) as RoomJoinAck;
      if (!ack.ok) return ack.code;
      if (socket === current && current.connected) serverJoined.add(roomId);
      return null;
    } catch {
      return 'INTERNAL';
    }
  }

  // 받기를 먼저 끝내고 보내기를 한다 (frontend.md 07절 4)
  async function recover(reconnected: boolean) {
    recovering = true;
    await Promise.all([...joined.keys()].map((roomId) => joinRoom(roomId)));
    recovering = false;
    if (socket === null || !socket.connected) return;
    // 연결을 기다리던 메시지를 다시 보내는 줄에 세운다
    update({
      pending: snapshot.pending.map((item) => (item.status === 'queued' ? { ...item, status: 'sending' } : item)),
    });
    pump();
    if (reconnected) handlers.onReconnected();
  }

  // ── 전송 대기열 ────────────────────────────────────
  // 한 번에 하나씩, 앞 메시지의 ack를 받은 뒤 다음을 보낸다 — 뒤 메시지가 먼저 저장되면 대화 순서가 뒤집힌다
  function pump() {
    const current = socket;
    if (current === null || !current.connected || recovering || inFlight !== null) return;
    const next = snapshot.pending.find((item) => item.status === 'sending');
    if (next === undefined) return;
    const wait = Math.max(lastEmitAt + SEND_GAP_MS, snapshot.sendBlockedUntil ?? 0) - now();
    if (wait > 0) {
      later(wait, pump);
      return;
    }
    if (snapshot.sendBlockedUntil !== null) update({ sendBlockedUntil: null });

    turns += 1;
    const flight = { tempId: next.tempId, turn: turns };
    inFlight = flight;
    if (!serverJoined.has(next.roomId)) {
      void joinForSend(next.roomId).then((code) => {
        if (inFlight?.turn !== flight.turn) return;
        inFlight = null;
        if (code !== null) {
          patchPending(next.tempId, { status: 'failed', failure: SEND_FAILURE[code] });
          if (code === 'FORBIDDEN') handlers.onRoomDenied(next.roomId, code);
        }
        pump();
      });
      return;
    }
    lastEmitAt = now();
    // 타임아웃 없는 emit은 끊긴 동안 버퍼에 남았다가 재연결 뒤 몰래 전송된다 — 항상 5초 ack와 함께 [AC-CH-37]
    current
      .timeout(SEND_ACK_TIMEOUT_MS)
      .emitWithAck('message:send', { roomId: next.roomId, tempId: next.tempId, content: next.content })
      .then(
        (result) => settle(flight, result as MessageSendAck),
        () => settle(flight, null),
      );
  }

  function settle(flight: { tempId: string; turn: number }, ack: MessageSendAck | null) {
    // 그사이 끊겼다 — 이 메시지는 이미 "연결 중…"으로 돌아가 같은 tempId로 다시 보내진다
    if (inFlight?.turn !== flight.turn) return;
    inFlight = null;
    const { tempId } = flight;
    const item = snapshot.pending.find((pending) => pending.tempId === tempId);
    // 기다리는 사이에 사용자가 지웠다
    if (item === undefined) {
      pump();
      return;
    }
    if (ack === null) {
      // 서버가 저장했는지 알 수 없다. 말풍선은 남기고, 같은 tempId로 다시 보내면 어느 쪽이든 안전하다 [AC-CH-04]
      patchPending(tempId, { status: 'failed', failure: SEND_FAILURE.TIMEOUT });
    } else if (ack.ok) {
      dropPending(tempId);
      handlers.onDelivered(ack.message);
    } else if (ack.code === 'RATE_LIMITED') {
      // 사용자가 잘못한 것이 아니다 — 실패로 바꾸지 않고 기다렸다가 다시 보낸다 [AC-CH-33]
      update({ sendBlockedUntil: now() + (ack.retryAfterMs ?? 1000) });
    } else {
      patchPending(tempId, { status: 'failed', failure: SEND_FAILURE[ack.code] });
      if (ack.code === 'PRODUCT_DELETED' || ack.code === 'FORBIDDEN') handlers.onRoomDenied(item.roomId, ack.code);
    }
    releaseRoom(item.roomId);
    pump();
  }

  // 연결을 기다린 지 30초가 지난 메시지는 실패로 [AC-CH-38]
  function expire(tempId: string) {
    const item = snapshot.pending.find((pending) => pending.tempId === tempId);
    if (item?.status !== 'queued') return;
    patchPending(tempId, { status: 'failed', failure: SEND_FAILURE.TIMEOUT });
    releaseRoom(item.roomId);
  }

  // ── 연결 ───────────────────────────────────────────
  function attach(created: SocketLike) {
    created.on('connect', () => {
      const reconnected = everConnected;
      everConnected = true;
      lastServerError = null;
      setStatus('connected');
      void recover(reconnected);
    });

    created.on('disconnect', ((reason: string) => {
      inFlight = null;
      // 조인은 연결에 딸린 상태다. 다시 붙으면 처음부터
      serverJoined.clear();
      // 보내던 메시지와 줄 서 있던 메시지는 "연결 중…"으로 — 다시 붙으면 같은 tempId로 보낸다 (서버가 중복을 거른다)
      const waiting = snapshot.pending.filter((item) => item.status === 'sending');
      if (waiting.length > 0) {
        update({ pending: snapshot.pending.map((item) => (item.status === 'sending' ? { ...item, status: 'queued' } : item)) });
        for (const item of waiting) later(Math.max(0, item.createdAt + QUEUE_LIMIT_MS - now()), () => expire(item.tempId));
      }
      if (reason === 'io client disconnect') {
        setStatus('idle');
      } else if (reason === 'io server disconnect') {
        // 서버가 끊은 연결은 자동으로 다시 붙지 않는다. 이유를 보지 않으면 "다시 연결 중"인 채 영원히 멈춘다
        setStatus(lastServerError === 'UNAUTHORIZED' ? 'needs_login' : 'paused');
      } else {
        setStatus('reconnecting');
      }
    }) as never);

    created.on('connect_error', () => {
      if (created.active) {
        // 네트워크 문제 — socket.io가 간격을 늘려 가며 다시 시도한다
        setStatus(everConnected ? 'reconnecting' : 'connecting');
        return;
      }
      // 서버가 핸드셰이크를 거절했다. 자동 재시도는 없다
      if (tokenResult === 'failed') {
        // 토큰을 받지 못해 빈 토큰으로 간 것이다. 세션이 끝난 것이 아니다
        setStatus(everConnected ? 'reconnecting' : 'connecting');
        later(TOKEN_RETRY_MS, () => {
          if (socket === created && !created.connected) created.connect();
        });
        return;
      }
      setStatus('needs_login');
    });

    created.on('error', ((payload: { code: SocketErrorCode }) => {
      lastServerError = payload.code;
    }) as never);
    created.on('message:new', ((payload: { message: Message }) => handlers.onMessage(payload.message)) as never);
    created.on('room:read', ((payload: RoomReadEvent) => handlers.onRoomRead(payload)) as never);
    created.on('notification:unread', ((payload: NotificationUnreadEvent) => handlers.onUnread(payload)) as never);
    created.on('room:product_updated', ((payload: RoomProductUpdatedEvent) => handlers.onProductUpdated(payload)) as never);
  }

  // 연결 · 재연결마다 새 토큰을 받는다 — 60초 토큰이 재연결 때 만료돼 있지 않게 [AC-LI-18a]
  function auth(callback: (data: { token: string }) => void) {
    fetchToken().then(
      (token) => {
        tokenResult = token === 'unauthorized' ? 'unauthorized' : 'ok';
        callback({ token: token === 'unauthorized' ? '' : token });
      },
      () => {
        tokenResult = 'failed';
        callback({ token: '' });
      },
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    // 로그인 상태에서만 부른다. 이미 붙어 있으면 아무것도 하지 않는다
    connect() {
      if (socket !== null) {
        if (!socket.connected && (snapshot.status === 'paused' || snapshot.status === 'idle')) {
          setStatus('connecting');
          socket.connect();
        }
        return;
      }
      setStatus('connecting');
      socket = options.createSocket(auth);
      attach(socket);
    },

    // 로그아웃 · 화면 정리 — 대기열과 조인 기록까지 비운다 [AC-NT-10]
    disconnect() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      socket?.disconnect();
      socket = null;
      joined.clear();
      serverJoined.clear();
      inFlight = null;
      everConnected = false;
      snapshot = { status: 'idle', disconnectedAt: null, pending: [], sendBlockedUntil: null };
      for (const listener of listeners) listener();
    },

    // 채팅방 화면이 열릴 때. lastSeq는 그 방에서 받은 마지막 번호 — 재연결 때마다 다시 묻는다
    join(roomId: string, lastSeq: () => number | null) {
      joined.set(roomId, lastSeq);
      void joinRoom(roomId);
    },

    leave(roomId: string) {
      if (joined.delete(roomId)) releaseRoom(roomId);
    },

    // 화면이 열려 있는 방인가 — 열려 있지 않은 방의 메시지 캐시는 틈을 메울 수 없다
    isJoined: (roomId: string) => joined.has(roomId),

    // 번호가 건너뛰었다 — 연결이 살아 있어도 하나가 빠질 수 있다. 같은 방법으로 채운다 [AC-CH-05]
    resync(roomId: string) {
      void joinRoom(roomId);
    },

    // 말풍선을 바로 그리고, 연결돼 있으면 보낸다. 돌려주는 값은 그 말풍선의 tempId [AC-CH-03]
    send(roomId: string, content: string): string {
      const tempId = newId();
      const connected = socket?.connected === true;
      const createdAt = now();
      update({
        pending: [
          ...snapshot.pending,
          { tempId, roomId, content, createdAt, status: connected ? 'sending' : 'queued', failure: null },
        ],
      });
      if (connected) pump();
      else later(QUEUE_LIMIT_MS, () => expire(tempId));
      return tempId;
    },

    // 같은 tempId로 다시 — 서버가 이미 저장했으면 그 메시지를 돌려준다 [AC-CH-04]
    retry(tempId: string) {
      const item = snapshot.pending.find((pending) => pending.tempId === tempId);
      if (item === undefined || item.status !== 'failed') return;
      const connected = socket?.connected === true;
      const createdAt = now();
      patchPending(tempId, { status: connected ? 'sending' : 'queued', failure: null, createdAt });
      if (connected) pump();
      else later(QUEUE_LIMIT_MS, () => expire(tempId));
    },

    // 실패한 말풍선을 지운다. 서버에는 아무것도 보내지 않는다
    remove(tempId: string) {
      const item = snapshot.pending.find((pending) => pending.tempId === tempId);
      dropPending(tempId);
      if (item !== undefined) releaseRoom(item.roomId);
    },

    // 화면에 실제로 그린 마지막 메시지의 번호 [AC-CH-01]
    // 소켓으로 보냈으면 true. false면 HTTP로 시도한 것이라 닿았는지 모른다 — 다시 붙었을 때 한 번 더 보내야 한다
    read(roomId: string, seq: number): boolean {
      if (socket?.connected === true) {
        socket.emit('room:read', { roomId, seq });
        return true;
      }
      readFallback(roomId, seq);
      return false;
    },
  };
}

export type ChatSocket = ReturnType<typeof createChatSocket>;

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Message } from '@neighbo/shared-schema';
import { loginHref } from '@/features/auth/next';
import { sessionChange } from '@/features/auth/sessionChange';
import { useSessionUser } from '@/features/auth/SessionProvider';
import { queryKeys } from '@/lib/query/queryKeys';
import { createChatSocket, type ChatSocket, type SocketLike, type SocketSnapshot } from '@/lib/socket/chatSocket';
import { fetchSocketToken, postRead } from './api';
import { MessageToastList } from './MessageToastList';
import { createMessageToasts, shouldToast } from './messageToasts';
import { UnreadTitle } from './UnreadTitle';
import {
  addMessages,
  applyMessageToRooms,
  applyProduct,
  lastSeq,
  markRoomRead,
  setPartnerRead,
  setUnread,
} from './cache';

interface ChatSocketContextValue {
  socket: ChatSocket;
  // 지금 화면에 열려 있는 방 — 그 방의 새 메시지는 목록 배지를 올리지 않는다
  setViewingRoom(roomId: string | null): void;
}

// 테스트가 가짜 연결을 넣을 수 있게 내보낸다. 화면 코드는 useChatSocket()만 쓴다
export const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

// 목록 재정렬은 100ms 안의 이벤트를 한 번에 [AC-CL-05]
const REORDER_DEBOUNCE_MS = 100;

// 탭당 연결 하나 — 화면마다 연결하면 이동할 때마다 끊고 다시 붙는다 (frontend.md 07절 2)
// socketUrl은 서버 레이아웃이 검증한 값을 내려 준다
export function ChatSocketProvider({ socketUrl, children }: { socketUrl: string | null; children: ReactNode }) {
  const client = useQueryClient();
  const user = useSessionUser();
  const userId = user?.id ?? null;

  const value = useMemo(() => {
    // 처리기가 항상 지금의 값을 보게 한다 — 연결 관리자는 한 번만 만들고, 바뀌는 값은 여기에 적어 둔다
    const live = { userId: null as string | null, viewingRoomId: null as string | null };
    const toasts = createMessageToasts();
    let buffered: Message[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flushRooms = () => {
      timer = null;
      const messages = buffered;
      buffered = [];
      const myId = live.userId;
      if (myId === null) return;
      let complete = true;
      for (const message of messages) {
        complete = applyMessageToRooms(client, message, { myId, viewingRoomId: live.viewingRoomId }) && complete;
      }
      // 목록에 없는 방의 메시지 — 새로 생긴 방이다. 목록을 다시 받는다 [AC-CL-16]
      if (!complete) void client.invalidateQueries({ queryKey: queryKeys.allChatRooms() });
    };
    const queueRoomUpdate = (message: Message) => {
      buffered.push(message);
      timer ??= setTimeout(flushRooms, REORDER_DEBOUNCE_MS);
    };

    // 화면이 열려 있는 방만 메시지 캐시를 이어 붙인다
    // 닫힌 방은 틈이 생겨도 메울 방법이 없다(조인해야 누락분을 받는다) — 틈을 안은 채 번호만 앞서가면
    // 다시 열 때 그 번호 뒤부터 받아 빠진 메시지가 영영 안 온다. 캐시를 버려 다음에 처음부터 받게 한다
    const receive = (message: Message) => {
      if (!socket.isJoined(message.roomId)) {
        client.removeQueries({ queryKey: queryKeys.messages(message.roomId) });
        return;
      }
      // 번호가 건너뛰었으면 그 자리에서 채운다 — 연결이 살아 있어도 하나가 빠질 수 있다 [AC-CH-05]
      const last = lastSeq(client, message.roomId);
      if (last !== null && message.seq > last + 1) socket.resync(message.roomId);
      addMessages(client, message.roomId, [message]);
    };

    const socket: ChatSocket = createChatSocket({
      createSocket: (auth) =>
        io(socketUrl ?? '', {
          auth,
          // 재연결 간격은 최대 5초, 한꺼번에 몰리지 않게 흩뜨린다 [AC-CH-43]
          reconnectionDelayMax: 5000,
          randomizationFactor: 0.5,
        }) as unknown as SocketLike,
      fetchToken: fetchSocketToken,
      readFallback: (roomId, seq) => {
        // 소켓이 없으면 읽음의 결과도 돌아오지 않는다 — 직접 고친다
        postRead(roomId, seq).then(
          () => {
            markRoomRead(client, roomId);
            void client.invalidateQueries({ queryKey: queryKeys.unread() });
          },
          () => {
            // 다음 읽음이 다시 보낸다
          },
        );
      },
      handlers: {
        onMessage(message) {
          receive(message);
          queueRoomUpdate(message);
        },
        onDelivered(message) {
          receive(message);
          queueRoomUpdate(message);
        },
        onMissed(roomId, missed, hasMore) {
          addMessages(client, roomId, missed);
          // 100개를 넘겨 일부만 왔다 — 최신 쪽을 HTTP로 다시 받는다
          if (hasMore) void client.invalidateQueries({ queryKey: queryKeys.messages(roomId) });
        },
        onRoomRead(event) {
          if (event.userId === live.userId) markRoomRead(client, event.roomId);
          else setPartnerRead(client, event.roomId, event.lastReadSeq);
        },
        onUnread(event) {
          setUnread(client, event.total);
          // 배지는 언제나 맞추고, 토스트는 보고 있지 않은 방의 새 메시지일 때만 [AC-NT-05, 14]
          const visible = document.visibilityState === 'visible';
          const context = { pathname: window.location.pathname, viewingRoomId: live.viewingRoomId, visible };
          if (event.latest !== null && shouldToast(event.latest.roomId, context)) toasts.push(event.latest);
        },
        onProductUpdated(event) {
          applyProduct(client, event.roomId, event.product);
        },
        onFirstConnected() {
          // 배지 숫자는 화면이 뜰 때 한 번 읽고 그 뒤는 소켓이 알린다
          // 읽은 뒤 · 붙기 전에 온 메시지는 어느 쪽에도 잡히지 않는다 — 붙자마자 한 번 더 읽는다
          void client.invalidateQueries({ queryKey: queryKeys.unread() });
        },
        onReconnected() {
          // 소켓으로만 갱신되는 캐시는 끊긴 동안의 변화를 모른다 — 빼먹으면 옛 값이 영영 남는다
          void client.invalidateQueries({ queryKey: queryKeys.unread() });
          void client.invalidateQueries({ queryKey: queryKeys.allChatRooms() });
          void client.invalidateQueries({ queryKey: queryKeys.allChatRoomDetails() });
          // 닫혀 있는 방의 메시지 캐시는 끊긴 동안의 메시지를 모른다
          for (const query of client.getQueryCache().findAll({ queryKey: queryKeys.allMessages() })) {
            const roomId = query.queryKey[1];
            if (typeof roomId === 'string' && !socket.isJoined(roomId)) client.removeQueries({ queryKey: query.queryKey });
          }
        },
        onRoomDenied(roomId) {
          // 상품이 삭제됐거나 더는 참여자가 아니다 — 방 정보를 다시 받아 화면이 맞춘다
          void client.invalidateQueries({ queryKey: queryKeys.chatRoom(roomId) });
        },
      },
    });

    return {
      socket,
      toasts,
      setViewingRoom(roomId: string | null) {
        live.viewingRoomId = roomId;
        // 그 방에 들어왔으면 그 방의 토스트는 할 일을 다 했다
        if (roomId !== null) toasts.dismiss(roomId);
      },
      setUser(id: string | null) {
        live.userId = id;
      },
    };
  }, [client, socketUrl]);

  // 로그인 상태에서만 연결한다 [AC-NT-10]
  useEffect(() => {
    value.setUser(userId);
    if (userId === null || socketUrl === null) return;
    value.socket.connect();
    return () => {
      value.socket.disconnect();
      value.toasts.clear();
    };
  }, [socketUrl, userId, value]);

  const status = useSyncExternalStore(
    value.socket.subscribe,
    () => value.socket.getSnapshot().status,
    () => 'idle' as const,
  );

  // 세션이 끝났다 — 지금 화면으로 돌아오도록 로그인으로 보낸다 [AC-CH-31]
  useEffect(() => {
    // 이 탭이 비밀번호를 바꾸는 중이면 끊긴 것이 당연하다 — 그 화면이 새 쿠키로 문서를 다시 받는다
    if (status !== 'needs_login' || sessionChange.active()) return;
    // 문서를 새로 받아 이전 세션의 캐시 · 연결을 버린다
    window.location.assign(loginHref(`${window.location.pathname}${window.location.search}`));
  }, [status]);

  // 돌아왔을 때 배지를 맞춘다. 숨겨진 동안 소켓이 끊겼을 수 있다 [AC-NT-04]
  useEffect(() => {
    if (userId === null) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void client.invalidateQueries({ queryKey: queryKeys.unread() });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [client, userId]);

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
      {userId !== null && (
        <>
          <MessageToastList store={value.toasts} />
          <UnreadTitle />
        </>
      )}
    </ChatSocketContext.Provider>
  );
}

export function useChatSocket(): ChatSocketContextValue {
  const value = useContext(ChatSocketContext);
  if (value === null) throw new Error('useChatSocket()은 ChatSocketProvider 안에서만 쓸 수 있다');
  return value;
}

const IDLE: SocketSnapshot = { status: 'idle', disconnectedAt: null, pending: [], sendBlockedUntil: null };

export function useSocketSnapshot(): SocketSnapshot {
  const { socket } = useChatSocket();
  return useSyncExternalStore(socket.subscribe, socket.getSnapshot, () => IDLE);
}

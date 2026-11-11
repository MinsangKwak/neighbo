import type {
  ChatRoomPage,
  ChatRoomResponse,
  MessagePage,
  ReadResponse,
  SocketTokenResponse,
  UnreadResponse,
} from '@neighbo/shared-schema';
import { ApiError } from '@/lib/api/ApiError';
import { apiFetch } from '@/lib/api/apiFetch';

export const ROOM_PAGE_SIZE = 30;
export const MESSAGE_PAGE_SIZE = 50;

// 쿼리 문자열은 서버 렌더와 브라우저가 같은 함수로 만든다
export function roomListQuery(productId: string | null, cursor: string | null): Record<string, string> {
  return {
    limit: String(ROOM_PAGE_SIZE),
    ...(productId === null ? {} : { productId }),
    ...(cursor === null ? {} : { cursor }),
  };
}

export function messageListQuery(before: string | null): Record<string, string> {
  return { limit: String(MESSAGE_PAGE_SIZE), ...(before === null ? {} : { before }) };
}

export const fetchChatRoomPage = (productId: string | null, cursor: string | null) =>
  apiFetch<ChatRoomPage>('/chat-rooms', { query: roomListQuery(productId, cursor) });

export const fetchChatRoom = (id: string) => apiFetch<ChatRoomResponse>(`/chat-rooms/${id}`);

export const fetchMessagePage = (roomId: string, before: string | null) =>
  apiFetch<MessagePage>(`/chat-rooms/${roomId}/messages`, { query: messageListQuery(before) });

// 기존 방이면 200, 새 방이면 201 — 어느 쪽이든 같은 방으로 간다 [AC-PD-13]
export const openChatRoom = (productId: string) =>
  apiFetch<ChatRoomResponse>('/chat-rooms', { method: 'POST', body: { productId } });

export const postRead = (roomId: string, seq: number) =>
  apiFetch<ReadResponse>(`/chat-rooms/${roomId}/read`, { method: 'POST', body: { seq } });

export const fetchUnread = () => apiFetch<UnreadResponse>('/me/unread');

// 소켓 연결용 토큰. 로그인이 풀렸으면 'unauthorized', 그 밖의 실패는 던진다 [AC-LI-18a]
export async function fetchSocketToken(): Promise<string | 'unauthorized'> {
  try {
    return (await apiFetch<SocketTokenResponse>('/auth/socket-token')).token;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return 'unauthorized';
    throw err;
  }
}

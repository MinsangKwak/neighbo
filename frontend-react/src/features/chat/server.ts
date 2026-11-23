import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { chatRoomPageSchema, chatRoomResponseSchema, messagePageSchema } from '@neighbo/shared-schema';
import { serverFetch } from '@/lib/api/serverFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { messageListQuery, roomListQuery } from './api';

const logError = (err: unknown) =>
  console.error(JSON.stringify({ lvl: 'error', msg: 'prefetch', err: err instanceof Error ? err.message : String(err) }));

// 첫 30개를 서버에서 가져와 브라우저 캐시로 넘긴다 [AC-CL-01]
// 실패하면 빈 상태로 넘기고, 브라우저의 조회가 오류 화면과 [다시 시도]를 맡는다
export async function prefetchChatList(productId: string | null): Promise<DehydratedState> {
  const client = new QueryClient();
  try {
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.chatRooms(productId),
      initialPageParam: null as string | null,
      queryFn: async () => {
        const response = await serverFetch(`/chat-rooms?${new URLSearchParams(roomListQuery(productId, null)).toString()}`);
        if (!response.ok) throw new Error(`채팅 목록 조회 실패 ${response.status}`);
        return chatRoomPageSchema.parse(await response.json());
      },
    });
  } catch (err) {
    logError(err);
  }
  return dehydrate(client);
}

// 방 정보와 최신 50개 [AC-CH-10]
// 참여자가 아니면(없는 방 포함) null — 호출부가 notFound()
export async function prefetchChatRoom(roomId: string): Promise<{ state: DehydratedState; partner: string } | null> {
  const path = `/chat-rooms/${encodeURIComponent(roomId)}`;
  const response = await serverFetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`채팅방 조회 실패 ${response.status}`);
  const room = chatRoomResponseSchema.parse(await response.json());

  const client = new QueryClient();
  client.setQueryData(queryKeys.chatRoom(roomId), room);
  try {
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.messages(roomId),
      initialPageParam: null as string | null,
      queryFn: async () => {
        const messages = await serverFetch(`${path}/messages?${new URLSearchParams(messageListQuery(null)).toString()}`);
        if (!messages.ok) throw new Error(`메시지 조회 실패 ${messages.status}`);
        return messagePageSchema.parse(await messages.json());
      },
    });
  } catch (err) {
    // 메시지만 실패하면 방은 그리고, 본문 자리에서 [다시 시도]를 보인다 [CH-NW-01]
    logError(err);
  }
  return { state: dehydrate(client), partner: room.chatRoom.partner.nickname };
}

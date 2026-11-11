import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  normalizeText,
  type ChatRoomItem,
  type ChatRoomPage,
  type ChatRoomResponse,
  type Message,
  type MessagePage,
  type ProductSummary,
  type UnreadResponse,
} from '@neighbo/shared-schema';
import { queryKeys } from '@/lib/query/queryKeys';

// 소켓 이벤트 → 캐시. 화면은 캐시만 보고 그린다 (frontend.md 03절 "소켓 이벤트 → 캐시")
// 전부 "캐시가 있으면 고친다" — 열어 본 적 없는 화면의 캐시를 만들어 내지 않는다

type MessagesData = InfiniteData<MessagePage, string | null>;
type RoomsData = InfiniteData<ChatRoomPage, string | null>;

// 이 방에서 받은 마지막 번호. 캐시가 없으면 null
export function lastSeq(client: QueryClient, roomId: string): number | null {
  const data = client.getQueryData<MessagesData>(queryKeys.messages(roomId));
  if (data === undefined) return null;
  return data.pages[0]?.items[0]?.seq ?? 0;
}

// 새 메시지를 가장 최근 페이지에 합친다. 같은 번호는 한 번만 — ack와 message:new, 누락분이 겹쳐 와도 된다
export function addMessages(client: QueryClient, roomId: string, incoming: Message[]): void {
  if (incoming.length === 0) return;
  client.setQueryData<MessagesData>(queryKeys.messages(roomId), (data) => {
    const first = data?.pages[0];
    if (data === undefined || first === undefined) return data;
    const known = new Set(data.pages.flatMap((page) => page.items.map((item) => item.seq)));
    const fresh = incoming.filter((message) => message.roomId === roomId && !known.has(message.seq));
    if (fresh.length === 0) return data;
    // 한 페이지 안은 최신이 앞이다
    const items = [...fresh, ...first.items].sort((a, b) => b.seq - a.seq);
    return { ...data, pages: [{ ...first, items }, ...data.pages.slice(1)] };
  });
}

// 목록의 미리보기는 한 줄 [CL-OK-06]
const preview = (content: string) => Array.from(normalizeText(content)).slice(0, 100).join('');

// 새 메시지가 온 방을 목록 맨 위로 올리고 미리보기 · 시각 · 배지를 고친다 [AC-CL-05]
// 목록 캐시가 있는데 그 방이 없으면 false — 호출하는 쪽이 목록을 다시 받는다 (새로 생긴 방)
export function applyMessageToRooms(
  client: QueryClient,
  message: Message,
  options: { myId: string; viewingRoomId: string | null },
): boolean {
  let missing = false;
  for (const [key, data] of client.getQueriesData<RoomsData>({ queryKey: queryKeys.allChatRooms() })) {
    const firstPage = data?.pages[0];
    if (data === undefined || firstPage === undefined) continue;
    const row = data.pages.flatMap((page) => page.items).find((item) => item.id === message.roomId);
    if (row === undefined) {
      // 상품으로 거른 목록에는 원래 없을 수 있다
      const filtered = (key[1] as { productId: string | null } | undefined)?.productId ?? null;
      if (filtered === null) missing = true;
      continue;
    }
    // 이미 반영한 메시지(늦게 온 중복)는 다시 세지 않는다
    if (row.lastMessage !== null && new Date(row.lastMessage.createdAt) > new Date(message.createdAt)) continue;
    const unread = message.senderId !== options.myId && options.viewingRoomId !== message.roomId;
    const updated: ChatRoomItem = {
      ...row,
      lastMessage: { content: preview(message.content), senderId: message.senderId, createdAt: message.createdAt },
      lastActivityAt: message.createdAt,
      unreadCount: unread ? row.unreadCount + 1 : row.unreadCount,
    };
    const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== row.id) }));
    client.setQueryData<RoomsData>(key, {
      ...data,
      pages: [{ ...firstPage, items: [updated, ...(pages[0]?.items ?? [])] }, ...pages.slice(1)],
    });
  }
  return !missing;
}

function patchRooms(client: QueryClient, roomId: string, patch: (row: ChatRoomItem) => ChatRoomItem): void {
  client.setQueriesData<RoomsData>({ queryKey: queryKeys.allChatRooms() }, (data) =>
    data === undefined
      ? data
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === roomId ? patch(item) : item)),
          })),
        },
  );
}

// 내가 (이 탭이든 다른 탭이든) 방을 읽었다 — 그 행의 배지를 지운다 [AC-CL-06, 15]
export function markRoomRead(client: QueryClient, roomId: string): void {
  patchRooms(client, roomId, (row) => (row.unreadCount === 0 ? row : { ...row, unreadCount: 0 }));
}

// 상대가 읽은 위치 — 내 마지막 메시지 아래 "읽음"의 근거. 뒤로 가지 않는다 [AC-CH-02]
export function setPartnerRead(client: QueryClient, roomId: string, seq: number): void {
  client.setQueryData<ChatRoomResponse>(queryKeys.chatRoom(roomId), (data) =>
    data === undefined || data.chatRoom.partnerLastReadSeq >= seq
      ? data
      : { chatRoom: { ...data.chatRoom, partnerLastReadSeq: seq } },
  );
}

export function setUnread(client: QueryClient, rooms: number): void {
  client.setQueryData<UnreadResponse>(queryKeys.unread(), { rooms });
}

// 상품이 바뀌었다 — 방의 요약 바와 목록 행을 고치고, 상세 화면의 캐시는 다시 받게 한다 [AC-CH-41]
export function applyProduct(client: QueryClient, roomId: string, product: ProductSummary): void {
  client.setQueryData<ChatRoomResponse>(queryKeys.chatRoom(roomId), (data) =>
    data === undefined ? data : { chatRoom: { ...data.chatRoom, product } },
  );
  patchRooms(client, roomId, (row) => ({ ...row, product }));
  void client.invalidateQueries({ queryKey: queryKeys.product(product.id) });
}

// 같은 방이 두 번 실려 오면 한 번만 그린다 — [더 보기] 도중 순서가 바뀌면 이미 받은 행이 다시 온다 [AC-CL-10]
export function uniqueRooms(pages: ChatRoomPage[]): ChatRoomItem[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((item) => !seen.has(item.id) && seen.add(item.id));
}

// 캐시 키는 이 파일에서만 만든다 — 문자열을 직접 쓰면 오타 하나로 무효화가 조용히 실패한다
export interface ProductListFilters {
  q: string | null;
  hideSold: boolean;
}

export const queryKeys = {
  products: (filters: ProductListFilters) => ['products', filters] as const,
  allProducts: () => ['products'] as const,
  product: (id: string) => ['product', id] as const,
  chatPartners: (id: string) => ['product', id, 'chatPartners'] as const,
  // 마이페이지의 탭별 목록 — status는 ON_SALE · RESERVED · SOLD · PURCHASED
  myList: (status: string) => ['me', 'list', status] as const,
  allMyLists: () => ['me', 'list'] as const,
  // 읽지 않은 메시지가 있는 방의 수 — 탭 배지
  unread: () => ['me', 'unread'] as const,
  // productId가 있으면 그 상품의 방만
  chatRooms: (productId: string | null) => ['chatRooms', { productId }] as const,
  allChatRooms: () => ['chatRooms'] as const,
  chatRoom: (id: string) => ['chatRoom', id] as const,
  allChatRoomDetails: () => ['chatRoom'] as const,
  messages: (roomId: string) => ['messages', roomId] as const,
  allMessages: () => ['messages'] as const,
};

import type { Message, NotificationUnreadEvent, ProductSummary } from '@neighbo/shared-schema';

// 서비스가 아는 실시간 전달의 전부 — Socket.IO를 직접 부르지 않는다 (backend.md 09절 5)
// 서비스는 트랜잭션이 커밋된 뒤에만 이 함수들을 부른다 [AC-CH-44]
export interface Realtime {
  // 방 참여자와 보낸 사람의 다른 세션에 메시지를, 받는 사람의 모든 세션에 배지를 보낸다
  messageCreated(event: {
    message: Message;
    receiverId: string;
    // 받는 사람의 배지 숫자와 토스트용 요약
    unread: NotificationUnreadEvent;
    // 보낸 연결 — ack로 이미 확정했으니 다시 보내지 않는다
    originConnectionId: string | null;
  }): void;
  // 상대에게는 "읽음" 표시, 내 다른 세션에는 배지 [AC-CH-02, 40]
  roomRead(event: { roomId: string; userId: string; lastReadSeq: number; unreadRooms: number }): void;
  // 상품이 바뀌면 그 상품의 모든 방에 알린다 [AC-CH-41]
  productUpdated(event: { roomIds: string[]; product: ProductSummary }): void;
}

// 소켓 서버가 없는 곳(시드 · 일부 테스트)에서 쓴다
export const silentRealtime: Realtime = {
  messageCreated() {},
  roomRead() {},
  productUpdated() {},
};

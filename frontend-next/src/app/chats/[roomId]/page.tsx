import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ChatRoomScreen } from '@/features/chat';
import { prefetchChatRoom } from '@/features/chat/server';

// 방 이름(상대 닉네임)은 참여자만 알 수 있다 — 제목에는 넣지 않는다
export const metadata: Metadata = { title: '채팅' };

// 탭 묶음 밖 — 탭바 없이 입력창이 화면 아래에 붙는다 [AC-CH-20]
// loading.tsx를 두지 않는다: 스트리밍이 시작되면 404 화면이 상태 코드 200으로 나간다 (I-07)
export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const user = await getSessionUser();
  if (user === null) redirect(loginHref(`/chats/${roomId}`));

  const room = await prefetchChatRoom(roomId);
  // 참여자가 아니면 방이 있다는 사실도 숨긴다 [CH-AU-01]
  if (room === null) notFound();

  return (
    <HydrationBoundary state={room.state}>
      <ChatRoomScreen roomId={roomId} myId={user.id} />
    </HydrationBoundary>
  );
}

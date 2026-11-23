import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ChatList, ConnectionBar } from '@/features/chat';
import { prefetchChatList } from '@/features/chat/server';

export const metadata: Metadata = { title: '채팅' };

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const raw = (await searchParams).productId;
  // 상세의 [대화 중인 채팅 N]에서 오면 그 상품의 방만 [AC-CL-07]
  const productId = typeof raw === 'string' && raw !== '' && raw.length <= 64 ? raw : null;
  const here = productId === null ? '/chats' : `/chats?productId=${encodeURIComponent(productId)}`;

  // 보호 화면의 2겹: 토큰이 실제로 유효한지는 서버가 판단한다 [AC-CM-01]
  const user = await getSessionUser();
  if (user === null) redirect(loginHref(here));
  const state = await prefetchChatList(productId);

  return (
    <>
      <header className="flex h-14 items-center border-b border-divider px-4">
        <h1 className="text-lg font-semibold">채팅</h1>
      </header>
      <ConnectionBar />
      <main className="flex-1">
        <HydrationBoundary state={state}>
          <ChatList productId={productId} />
        </HydrationBoundary>
      </main>
    </>
  );
}

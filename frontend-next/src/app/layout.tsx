import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/Toast';
import { AuthSync, Flash, SessionProvider } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ChatSocketProvider } from '@/features/chat';
import { RouteFocus } from '@/lib/a11y/RouteFocus';
import { getSocketUrl } from '@/lib/config';
import { QueryProvider } from '@/lib/query/QueryProvider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'neighbo', template: '%s · neighbo' },
  description: '동네 중고거래 — 물건을 올리고, 채팅으로 약속을 잡고, 거래 내역을 확인합니다.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // 서버 렌더 시점에 로그인 상태를 알아내 깜빡임 없이 그린다 [AC-LI-03]
  const user = await getSessionUser();

  return (
    <html lang="ko">
      <body className="min-h-dvh bg-surface text-base text-text antialiased">
        <SessionProvider user={user}>
          <QueryProvider>
          <ToastProvider>
          {/* 주소가 없으면 연결하지 않는다 — 화면은 HTTP만으로도 그려진다 */}
          <ChatSocketProvider socketUrl={getSocketUrl()}>
            {/* 본문 폭 640px 단일 열 — PC에서도 같은 구성 (결정 0014) */}
            <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-bg">
              <AuthSync />
              <RouteFocus />
              {children}
            </div>
            <Flash />
          </ChatSocketProvider>
          </ToastProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

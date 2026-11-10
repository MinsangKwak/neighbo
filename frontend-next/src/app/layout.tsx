import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'neighbo', template: '%s · neighbo' },
  description: '동네 중고거래 — 물건을 올리고, 채팅으로 약속을 잡고, 거래 내역을 확인합니다.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-surface text-base text-text antialiased">
        {/* 본문 폭 640px 단일 열 — PC에서도 같은 구성 (결정 0014) */}
        <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-bg">{children}</div>
      </body>
    </html>
  );
}

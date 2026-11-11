'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Tab {
  href: string;
  label: string;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  { href: '/', label: '홈', match: (path) => path === '/' || path.startsWith('/search') },
  { href: '/chats', label: '채팅', match: (path) => path.startsWith('/chats') },
  { href: '/me', label: '마이', match: (path) => path.startsWith('/me') },
];

// chatBadge: [채팅] 옆에 붙는 읽지 않은 수. 기능 모듈을 직접 가져오지 않게 바깥에서 받는다
export function TabBar({ chatBadge }: { chatBadge?: ReactNode }) {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="sticky bottom-0 z-10 border-t border-divider bg-bg">
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-touch items-center justify-center py-3 text-sm ${
                  active ? 'font-semibold text-primary' : 'text-text-muted'
                }`}
              >
                {tab.label}
                {tab.href === '/chats' && chatBadge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

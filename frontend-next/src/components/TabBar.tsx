'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Tab {
  href: string;
  label: string;
  // 24×24 선 그림의 path — 장식이다. 이름은 아래 글자가 말한다
  icon: string;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: '/',
    label: '홈',
    icon: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10',
    match: (path) => path === '/' || path.startsWith('/search'),
  },
  {
    href: '/chats',
    label: '채팅',
    icon: 'M4.5 5.5h15v10.5h-8l-4.5 3.5v-3.5h-2.5z',
    match: (path) => path.startsWith('/chats'),
  },
  {
    href: '/me',
    label: '마이',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
    match: (path) => path.startsWith('/me'),
  },
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
                className={`flex min-h-touch flex-col items-center justify-center gap-1 py-2 text-xs ${
                  active ? 'font-semibold text-primary' : 'text-text-muted'
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={tab.icon} />
                </svg>
                <span className="inline-flex items-center">
                  {tab.label}
                  {tab.href === '/chats' && chatBadge}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

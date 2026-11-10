'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 채팅 탭은 채팅 단계에서 더한다
const TABS = [
  { href: '/', label: '홈', match: (path: string) => path === '/' || path.startsWith('/search') },
  { href: '/me', label: '마이', match: (path: string) => path.startsWith('/me') },
];

export function TabBar() {
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

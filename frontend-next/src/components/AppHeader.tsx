'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

interface AppHeaderProps {
  // 주면 이 화면의 제목(h1)이 된다
  title?: string;
  action?: ReactNode;
  // 히스토리가 없을 때(링크로 바로 들어온 경우) 뒤로가 갈 곳
  fallbackHref?: string;
}

// 탭 밖 화면의 헤더. 뒤로는 히스토리가 없으면 홈으로 간다 [AC-PD-23]
export function AppHeader({ title, action, fallbackHref = '/' }: AppHeaderProps) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-divider bg-bg px-2">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.replace(fallbackHref);
        }}
        className="inline-flex size-touch items-center justify-center text-xl"
      >
        <span aria-hidden="true">←</span>
      </button>
      {title !== undefined && <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>}
      {title === undefined && <span className="flex-1" />}
      {action}
    </header>
  );
}

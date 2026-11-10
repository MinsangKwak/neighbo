'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// 탭 밖 화면의 헤더. 뒤로는 히스토리가 없으면 홈으로 간다 [AC-PD-23]
export function AppHeader({ title, action }: { title?: string; action?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-divider bg-bg px-2">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.replace('/');
        }}
        className="inline-flex size-touch items-center justify-center text-xl"
      >
        <span aria-hidden="true">←</span>
      </button>
      {title !== undefined && <p className="flex-1 truncate text-base font-semibold">{title}</p>}
      {title === undefined && <span className="flex-1" />}
      {action}
    </header>
  );
}

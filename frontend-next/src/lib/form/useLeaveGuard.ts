'use client';

import { useEffect, useRef } from 'react';

// 고친 내용이 있는 동안 탭을 닫거나 새로고침하면 브라우저가 확인한다 [AC-PC-04, AC-MP-10]
// 저장에 성공했거나 나가기로 정했으면 allow()를 부른 뒤 이동한다
export function useLeaveGuard(dirty: boolean) {
  const allowed = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!allowed.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return {
    allow: () => {
      allowed.current = true;
    },
  };
}

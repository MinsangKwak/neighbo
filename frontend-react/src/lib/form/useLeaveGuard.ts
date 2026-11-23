'use client';

import { useEffect, useRef } from 'react';
import { leaveGuard } from './leaveGuard';

// 고친 내용이 있는 동안 나가려 하면 확인한다 [AC-PC-04, AC-MP-10, AC-NT-05]
// 탭 닫기 · 새로고침은 브라우저가, 앱 안의 링크 · 뒤로 버튼 · 토스트는 LeaveConfirm이 묻는다
// 저장에 성공했거나 나가기로 정했으면 allow()를 부른 뒤 이동한다
export function useLeaveGuard(dirty: boolean) {
  const guard = useRef({ allowed: false });

  useEffect(() => {
    if (!dirty) return;
    const current = guard.current;
    const warn = (event: BeforeUnloadEvent) => {
      if (!current.allowed) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    const unregister = leaveGuard.register(current);
    return () => {
      window.removeEventListener('beforeunload', warn);
      unregister();
    };
  }, [dirty]);

  return {
    allow: () => {
      guard.current.allowed = true;
    },
  };
}

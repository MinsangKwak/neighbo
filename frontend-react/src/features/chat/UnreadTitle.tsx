'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useUnreadRooms } from './UnreadBadge';

const PREFIX = /^\(\d+\+?\) /;

// 읽지 않은 방이 있으면 탭 제목 앞에 수를 붙인다 — 다른 탭을 보고 있어도 알 수 있게 [AC-NT-08]
export function UnreadTitle() {
  const rooms = useUnreadRooms();
  // 화면을 옮기면 제목이 새로 쓰인다. 그때 다시 붙인다
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(PREFIX, '');
      const next = rooms > 0 ? `(${rooms > 99 ? '99+' : rooms}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // 제목은 화면 이동 뒤에 조금 늦게 바뀐다. 바뀌는 것을 보고 다시 붙인다
    const title = document.querySelector('title');
    if (title === null) return;
    const observer = new MutationObserver(apply);
    observer.observe(title, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [rooms, pathname]);

  return null;
}

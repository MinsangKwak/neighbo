'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// 새 화면이 늦게 그려질 때 제목을 기다리는 한도
const WAIT_MS = 5000;

// 경로가 바뀌면 포커스를 새 화면의 제목(h1)으로 옮긴다 [AC-CM-41]
// App Router는 이동 뒤 포커스를 관리하지 않는다 — 그대로 두면 사라진 링크에 남거나 body로 떨어져
// 스크린리더 사용자는 화면이 바뀐 것을 알 수 없다. 쿼리만 바뀔 때(필터 · 탭)는 옮기지 않는다
export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  // 이전 화면의 제목 — 경로는 먼저 바뀌고 새 화면은 뒤늦게 그려지므로(뼈대 화면), 제목이 바뀔 때까지 기다린다
  const shown = useRef<{ element: Element; text: string } | null>(null);

  useEffect(() => {
    const remember = () => {
      const heading = document.querySelector('h1');
      shown.current = heading === null ? null : { element: heading, text: heading.textContent ?? '' };
    };
    if (previous.current === pathname) {
      remember();
      return;
    }
    previous.current = pathname;

    const tryFocus = (): boolean => {
      const heading = document.querySelector('h1');
      if (heading === null) return false;
      const before = shown.current;
      // 아직 이전 화면의 제목이다
      if (before !== null && before.element === heading && before.text === (heading.textContent ?? '')) return false;
      remember();
      // 새 화면이 스스로 포커스를 둔 곳(입력 칸 · 열린 대화 상자)이 있으면 건드리지 않는다
      // 방금 누른 링크나 버튼에 남은 포커스는 옮긴다 — 그 요소는 이전 화면의 것이다
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('input, textarea, select, [contenteditable], dialog[open]') !== null) {
        return true;
      }
      // 제목은 Tab 순서에 넣지 않고 코드로만 포커스한다
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      return true;
    };

    if (tryFocus()) return;
    const observer = new MutationObserver(() => {
      if (tryFocus()) stop();
    });
    const timer = setTimeout(() => stop(), WAIT_MS);
    function stop() {
      observer.disconnect();
      clearTimeout(timer);
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return stop;
  }, [pathname]);

  return null;
}

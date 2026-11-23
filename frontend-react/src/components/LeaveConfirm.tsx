'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { leaveGuard } from '@/lib/form/leaveGuard';
import { Button } from './Button';
import { Dialog } from './Dialog';

// 같은 탭에서 앱 안 주소로 가는 평범한 왼쪽 클릭인가 — 새 탭 · 다운로드 · 바깥 주소 · 같은 화면의 #은 그대로 둔다
function internalHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute('download')) return null;
  if (anchor.target !== '' && anchor.target !== '_self') return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// 앱 안 이동의 이탈 확인 창 — 레이아웃에 하나 둔다 [AC-PC-04, AC-MP-10, AC-NT-05]
export function LeaveConfirm() {
  const router = useRouter();
  const open = useSyncExternalStore(leaveGuard.subscribe, leaveGuard.isPending, () => false);

  useEffect(() => {
    // window의 캡처 단계에서 가로챈다 — React는 document에 듣고 있어 Link의 이동보다 먼저 막을 수 있다
    const intercept = (event: MouseEvent) => {
      if (!leaveGuard.isBlocking()) return;
      const href = internalHref(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      leaveGuard.request(() => router.push(href));
    };
    window.addEventListener('click', intercept, true);
    return () => window.removeEventListener('click', intercept, true);
  }, [router]);

  return (
    <Dialog open={open} onClose={() => leaveGuard.cancel()} title="작성 중인 내용이 사라져요. 나갈까요?" alert>
      <div className="flex gap-2">
        <Button variant="secondary" block autoFocus onClick={() => leaveGuard.cancel()}>
          계속 작성
        </Button>
        <Button variant="danger" block onClick={() => leaveGuard.confirm()}>
          나가기
        </Button>
      </div>
    </Dialog>
  );
}

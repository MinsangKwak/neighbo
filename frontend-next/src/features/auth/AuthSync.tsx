'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthEvent } from './crossTab';
import { useSessionUser } from './SessionProvider';

// 다른 탭의 로그인 · 로그아웃을 이 탭에 반영한다
export function AuthSync() {
  const router = useRouter();
  const user = useSessionUser();
  const [switched, setSwitched] = useState(false);

  useEffect(
    () =>
      onAuthEvent((event) => {
        if (event.type === 'logout' && user !== null) {
          // 한 탭에서 로그아웃하면 다른 탭도 로그인 화면으로 [AC-LI-14]
          // 라우터 이동이 아니라 문서를 새로 받는다 — 이 탭에 남은 이전 계정의 상태를 전부 버리려고
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign('/login');
        }
        if (event.type === 'login' && user !== null && event.userId !== user.id) {
          // 다른 계정으로 로그인된 경우 — 이 탭의 화면은 이전 계정의 것이다 [AC-LI-15]
          setSwitched(true);
        }
        if (event.type === 'login' && user === null) router.refresh();
      }),
    [router, user],
  );

  if (!switched) return null;
  return (
    <p role="alert" className="bg-surface px-4 py-3 text-sm">
      다른 계정으로 로그인됐어요. 새로고침해 주세요{' '}
      <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>
        새로고침
      </button>
    </p>
  );
}

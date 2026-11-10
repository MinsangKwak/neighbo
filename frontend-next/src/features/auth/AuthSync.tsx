'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/apiFetch';
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

  // 세션 연장은 브라우저가 부른 /api/* 응답의 쿠키로만 일어난다 — 서버 렌더의 /me 조회는 쿠키를 쓸 수 없다
  // 로그인 상태로 문서를 열 때 한 번 불러 연장 쿠키를 받는다 [AC-CM-03]
  // (배지 조회 /api/me/unread가 생기면 그 요청이 이 역할을 맡는다)
  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) return;
    apiFetch('/me').catch(() => {
      // 연장 실패는 알리지 않는다. 만료되면 보호 화면이 로그인으로 보낸다
    });
  }, [userId]);

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

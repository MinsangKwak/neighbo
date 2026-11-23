import 'server-only';
import { cache } from 'react';
import { authResponseSchema, type UserSelf } from '@neighbo/shared-schema';
import { hasSessionCookie, serverFetch } from '@/lib/api/serverFetch';

// 서버 렌더가 로그인 상태를 알아내는 조회 [AC-LI-03]
// 한 번의 렌더 안에서는 한 번만 부른다 (레이아웃과 페이지가 같이 써도)
export const getSessionUser = cache(async (): Promise<UserSelf | null> => {
  // 쿠키가 없으면 백엔드를 부르지 않는다 — 비로그인 방문은 백엔드 상태와 무관하게 그려진다
  if (!(await hasSessionCookie())) return null;
  try {
    const response = await serverFetch('/me');
    if (!response.ok) return null;
    return authResponseSchema.parse(await response.json()).user;
  } catch (err) {
    // 백엔드에 닿지 못해도 공개 화면은 비로그인 상태로 그린다
    console.error(JSON.stringify({ lvl: 'error', msg: 'session', err: err instanceof Error ? err.message : String(err) }));
    return null;
  }
});

import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { REQUEST_ID_HEADER, SESSION_COOKIE } from '@neighbo/shared-schema';
import { getServerConfig } from '@/lib/config';

// 서버 컴포넌트가 백엔드를 부르는 유일한 길
// - 항상 no-store: 사용자별 응답이 서버 캐시에 남아 다른 사람에게 보이지 않게
// - 세션 쿠키만 넘긴다. 백엔드가 준 Set-Cookie는 버린다(렌더 중에는 쿠키를 쓸 수 없다) [AC-CM-03]
export async function serverFetch(path: string): Promise<Response> {
  const config = getServerConfig();
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  return fetch(`${config.API_URL}${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: {
      [REQUEST_ID_HEADER]: randomUUID(),
      'X-Proxy-Secret': config.PROXY_SECRET,
      ...(session === undefined ? {} : { Cookie: `${SESSION_COOKIE}=${session}` }),
    },
  });
}

export async function hasSessionCookie(): Promise<boolean> {
  return ((await cookies()).get(SESSION_COOKIE)?.value ?? '') !== '';
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { REQUEST_ID_HEADER, SESSION_COOKIE } from '@neighbo/shared-schema';
import { getServerConfig, type ServerConfig } from '@/lib/config';

const TIMEOUT_MS = 10_000;

function backendTarget(apiUrl: string, path: string): URL {
  // 프로토콜 상대 URL(//host)은 다른 오리진으로 바뀌므로 내부 호출도 한 번 더 막는다.
  if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('백엔드 경로는 /로 시작해야 한다');
  const target = new URL(path, `${apiUrl}/`);
  if (target.origin !== apiUrl) throw new TypeError('백엔드 주소 밖으로 요청할 수 없다');
  return target;
}

// 실제 HTTP 서버를 둔 테스트에서 공유 비밀과 세션이 리다이렉트 너머로 나가지 않는지 검증한다.
export async function fetchBackendForRender(
  path: string,
  config: ServerConfig,
  session: string | undefined,
): Promise<Response> {
  return fetch(backendTarget(config.API_URL, path), {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      [REQUEST_ID_HEADER]: randomUUID(),
      'X-Proxy-Secret': config.PROXY_SECRET,
      ...(session === undefined ? {} : { Cookie: `${SESSION_COOKIE}=${session}` }),
    },
  });
}

// 서버 컴포넌트가 백엔드를 부르는 유일한 길
// - 항상 no-store: 사용자별 응답이 서버 캐시에 남아 다른 사람에게 보이지 않게
// - 세션 쿠키만 넘긴다. 백엔드가 준 Set-Cookie는 버린다(렌더 중에는 쿠키를 쓸 수 없다) [AC-CM-03]
export async function serverFetch(path: string): Promise<Response> {
  const config = getServerConfig();
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  return fetchBackendForRender(path, config, session);
}

export async function hasSessionCookie(): Promise<boolean> {
  return ((await cookies()).get(SESSION_COOKIE)?.value ?? '') !== '';
}

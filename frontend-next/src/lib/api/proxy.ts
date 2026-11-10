import 'server-only';
import { randomUUID } from 'node:crypto';
import { ERROR_CATALOG, REQUEST_ID_HEADER, type ErrorCode, type ErrorResponse } from '@neighbo/shared-schema';
import type { ServerConfig } from '@/lib/config';

// 같은 오리진 프록시 — 브라우저의 /api/* 를 백엔드로 넘긴다 [결정 0004]
// 근거: docs/architecture/flow.md 연결 경로 · docs/troubleshooting.md T-02

const TIMEOUT_MS = 10_000;

// 브라우저 → 백엔드로 넘기는 헤더. 여기 없는 것은 넘기지 않는다
// (X-Client-IP · X-Proxy-Secret을 브라우저가 보내도 버려진다)
const REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'cookie', 'origin'];
// 백엔드 → 브라우저로 돌려주는 헤더. Set-Cookie는 여러 개라 따로 다룬다
const RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-request-id'];

function errorResponse(code: ErrorCode, status: number, requestId: string): Response {
  const body: ErrorResponse = { error: { code, message: ERROR_CATALOG[code].message, fields: null } };
  return Response.json(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId, 'Cache-Control': 'no-store' },
  });
}

// Vercel이 채운 원 IP — 맨 앞 값이 사용자다
function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded === undefined || forwarded === '' ? null : forwarded;
}

export async function proxyToBackend(
  request: Request,
  segments: readonly string[],
  config: ServerConfig,
): Promise<Response> {
  const requestId = randomUUID();

  // 경로 조각을 다시 인코딩해 백엔드 주소 밖으로 나가지 못하게 한다
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return errorResponse('NOT_FOUND', 404, requestId);
  }
  const path = segments.map(encodeURIComponent).join('/');
  const target = `${config.API_URL}/${path}${new URL(request.url).search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set('X-Proxy-Secret', config.PROXY_SECRET);
  const ip = clientIp(request.headers);
  if (ip !== null) headers.set('X-Client-IP', ip);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 본문은 읽지 않고 그대로 흘려보낸다 — 업로드를 메모리에 올리지 않게
      ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    // 백엔드에 닿지 못했다. 원인은 서버 로그에서 요청 ID로 찾는다
    console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg: 'proxy', reqId: requestId }));
    return errorResponse('INTERNAL', 502, requestId);
  }

  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has(REQUEST_ID_HEADER)) responseHeaders.set(REQUEST_ID_HEADER, requestId);
  // 세션 연장 쿠키를 그대로 돌려준다
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('Set-Cookie', cookie);
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

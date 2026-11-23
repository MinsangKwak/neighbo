import 'server-only';
import type { ServerConfig } from '@/lib/config';
import {
  OPENAPI_SECURITY_HEADERS,
  SWAGGER_SECURITY_HEADERS,
  applySecurityHeaders,
  type SecurityHeader,
} from '@/lib/securityHeaders';

const TIMEOUT_MS = 10_000;

interface PublicDocument {
  upstreamPath: string;
  contentType: string;
  securityHeaders: readonly SecurityHeader[];
  openApi?: boolean;
}

const SWAGGER_DOCUMENTS = new Map<string, PublicDocument>([
  ['', { upstreamPath: '/node-swagger', contentType: 'text/html; charset=utf-8', securityHeaders: SWAGGER_SECURITY_HEADERS }],
  ['assets/swagger-ui.css', { upstreamPath: '/node-swagger/assets/swagger-ui.css', contentType: 'text/css; charset=utf-8', securityHeaders: SWAGGER_SECURITY_HEADERS }],
  ['assets/swagger-ui-bundle.js', { upstreamPath: '/node-swagger/assets/swagger-ui-bundle.js', contentType: 'text/javascript; charset=utf-8', securityHeaders: SWAGGER_SECURITY_HEADERS }],
  ['assets/init.js', { upstreamPath: '/node-swagger/assets/init.js', contentType: 'text/javascript; charset=utf-8', securityHeaders: SWAGGER_SECURITY_HEADERS }],
]);

const OPENAPI_DOCUMENT: PublicDocument = {
  upstreamPath: '/node-openapi.json',
  contentType: 'application/json; charset=utf-8',
  securityHeaders: OPENAPI_SECURITY_HEADERS,
  openApi: true,
};

function documentHeaders(document: PublicDocument): Headers {
  return applySecurityHeaders(new Headers({ 'Content-Type': document.contentType }), document.securityHeaders);
}

function localResponse(status: number, message: string, extraHeaders?: HeadersInit): Response {
  const headers = documentHeaders({
    upstreamPath: '',
    contentType: 'text/plain; charset=utf-8',
    securityHeaders: OPENAPI_SECURITY_HEADERS,
  });
  if (extraHeaders !== undefined) {
    for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  }
  return new Response(message, { status, headers });
}

function resolveSwaggerDocument(segments: readonly string[] | undefined): PublicDocument | null {
  return SWAGGER_DOCUMENTS.get((segments ?? []).join('/')) ?? null;
}

function withSameOriginServer(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return {
    ...(value as Record<string, unknown>),
    servers: [{ url: '/api', description: '동일 오리진 API 프록시' }],
  };
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 이미 버릴 오류 응답이므로 연결 정리 실패가 공개 응답을 바꾸지 않게 한다.
  }
}

async function proxyDocument(
  request: Request,
  document: PublicDocument | null,
  config: ServerConfig,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return localResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (document === null) return localResponse(404, 'Not Found');

  let upstream: Response;
  try {
    upstream = await fetch(`${config.API_URL}${document.upstreamPath}`, {
      method: request.method,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg: 'public-docs-proxy' }));
    return localResponse(502, 'Bad Gateway');
  }

  // 리다이렉트 Location과 백엔드의 임의 응답 헤더는 브라우저로 전달하지 않는다.
  if (upstream.status >= 300 && upstream.status < 400) {
    await discardBody(upstream);
    return localResponse(502, 'Bad Gateway');
  }
  if (!upstream.ok) {
    await discardBody(upstream);
    return localResponse(
      upstream.status === 404 ? 404 : 502,
      upstream.status === 404 ? 'Not Found' : 'Bad Gateway',
    );
  }

  const headers = documentHeaders(document);
  if (request.method === 'HEAD') return new Response(null, { status: upstream.status, headers });

  if (document.openApi === true) {
    try {
      const rewritten = withSameOriginServer(JSON.parse(await upstream.text()) as unknown);
      if (rewritten === null) return localResponse(502, 'Bad Gateway');
      return new Response(JSON.stringify(rewritten), { status: upstream.status, headers });
    } catch {
      return localResponse(502, 'Bad Gateway');
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export function proxySwaggerDocument(
  request: Request,
  segments: readonly string[] | undefined,
  config: ServerConfig,
): Promise<Response> {
  return proxyDocument(request, resolveSwaggerDocument(segments), config);
}

export function proxyOpenApiDocument(request: Request, config: ServerConfig): Promise<Response> {
  return proxyDocument(request, OPENAPI_DOCUMENT, config);
}

// @vitest-environment node
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SWAGGER_CONTENT_SECURITY_POLICY } from '@/lib/securityHeaders';
import { proxyOpenApiDocument, proxySwaggerDocument } from './docsProxy';

interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
}

const PROXY_SECRET = 'proxy-secret-0123456789-0123456789';
let backend: Server;
let redirectTarget: Server;
let apiUrl: string;
let redirectTargetUrl: string;
let redirectTargetHits = 0;
let openApiMode: 'valid' | 'invalid' | 'redirect' = 'valid';
const seen: SeenRequest[] = [];

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  redirectTarget = createServer((_req, res) => {
    redirectTargetHits += 1;
    res.end('redirect target');
  });
  redirectTargetUrl = await listen(redirectTarget);

  backend = createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    if (req.url === '/node-openapi.json') {
      if (openApiMode === 'redirect') {
        res.statusCode = 302;
        res.setHeader('Location', `${redirectTargetUrl}/schema`);
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(openApiMode === 'invalid'
        ? '{not-json'
        : JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'Neighbo API', version: '1.0.0' },
            servers: [{ url: '/', description: 'Node.js API' }],
            paths: { '/products': { get: { responses: { 200: { description: 'OK' } } } } },
          }));
      return;
    }
    if (req.url === '/node-swagger') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Set-Cookie', 'backend-session=must-not-leak');
      res.setHeader('Location', 'https://example.invalid/must-not-leak');
      res.end('<!doctype html><title>Neighbo Node API</title>');
      return;
    }
    if (req.url === '/node-swagger/assets/swagger-ui.css') {
      res.setHeader('Content-Type', 'text/css');
      res.end('.swagger-ui{}');
      return;
    }
    if (req.url === '/node-swagger/assets/swagger-ui-bundle.js' || req.url === '/node-swagger/assets/init.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end('void 0;');
      return;
    }
    res.statusCode = 404;
    res.end('missing');
  });
  apiUrl = await listen(backend);
});

beforeEach(() => {
  openApiMode = 'valid';
  redirectTargetHits = 0;
  seen.length = 0;
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => backend.close((err) => (err === undefined ? resolve() : reject(err)))),
    new Promise<void>((resolve, reject) => redirectTarget.close((err) => (err === undefined ? resolve() : reject(err)))),
  ]);
});

const config = () => ({ API_URL: apiUrl, PROXY_SECRET });

describe('공개 Node API 문서 프록시', () => {
  it('Swagger HTML을 고정 경로로만 읽고 인증 정보 없이 강한 문서 CSP를 붙인다', async () => {
    const response = await proxySwaggerDocument(
      new Request('http://app.test/node-swagger', {
        headers: { Authorization: 'Bearer browser-token', Cookie: 'nb_session=browser-session' },
      }),
      undefined,
      config(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Neighbo Node API');
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/node-swagger' });
    expect(seen[0]?.headers.authorization).toBeUndefined();
    expect(seen[0]?.headers.cookie).toBeUndefined();
    expect(seen[0]?.headers['x-proxy-secret']).toBeUndefined();
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Security-Policy')).toBe(SWAGGER_CONTENT_SECURITY_POLICY);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('Location')).toBeNull();
  });

  it('자체 호스팅 asset 세 개 외의 Swagger 하위 경로는 백엔드에 보내지 않는다', async () => {
    for (const [file, contentType] of [
      ['swagger-ui.css', 'text/css; charset=utf-8'],
      ['swagger-ui-bundle.js', 'text/javascript; charset=utf-8'],
      ['init.js', 'text/javascript; charset=utf-8'],
    ] as const) {
      const response = await proxySwaggerDocument(
        new Request(`http://app.test/node-swagger/assets/${file}`),
        ['assets', file],
        config(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(contentType);
    }

    const before = seen.length;
    const missing = await proxySwaggerDocument(
      new Request('http://app.test/node-swagger/admin'),
      ['admin'],
      config(),
    );
    expect(missing.status).toBe(404);
    expect(seen).toHaveLength(before);
  });

  it('OpenAPI JSON의 servers만 동일 오리진 /api로 바꾸고 나머지 스키마를 유지한다', async () => {
    const response = await proxyOpenApiDocument(
      new Request('http://app.test/node-openapi.json'),
      config(),
    );
    const schema = await response.json() as Record<string, unknown>;

    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(schema).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Neighbo API', version: '1.0.0' },
      servers: [{ url: '/api', description: '동일 오리진 API 프록시' }],
      paths: { '/products': { get: { responses: { 200: { description: 'OK' } } } } },
    });
  });

  it('HEAD는 본문 없이 백엔드 HEAD로 확인한다', async () => {
    const response = await proxyOpenApiDocument(
      new Request('http://app.test/node-openapi.json', { method: 'HEAD' }),
      config(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(seen[0]).toMatchObject({ method: 'HEAD', url: '/node-openapi.json' });
  });

  it('리다이렉트를 따라가지 않고 Location을 숨긴다', async () => {
    openApiMode = 'redirect';
    const response = await proxyOpenApiDocument(
      new Request('http://app.test/node-openapi.json'),
      config(),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('Location')).toBeNull();
    expect(redirectTargetHits).toBe(0);
  });

  it('파싱할 수 없는 OpenAPI 응답은 브라우저로 전달하지 않는다', async () => {
    openApiMode = 'invalid';
    const response = await proxyOpenApiDocument(
      new Request('http://app.test/node-openapi.json'),
      config(),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Bad Gateway');
  });
});

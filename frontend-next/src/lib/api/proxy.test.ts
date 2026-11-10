// @vitest-environment node
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorResponseSchema } from '@neighbo/shared-schema';
import { proxyToBackend } from './proxy';

// 진짜 HTTP 서버를 백엔드 자리에 세우고 프록시가 무엇을 넘기는지 본다
interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let server: Server;
let apiUrl: string;
const seen: Seen[] = [];
const PROXY_SECRET = 'proxy-secret-0123456789-0123456789';

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      if (req.url?.startsWith('/login')) {
        res.setHeader('Set-Cookie', ['nb_session=abc; HttpOnly; Path=/', 'other=1; Path=/']);
      }
      if (req.url?.startsWith('/limited')) {
        res.statusCode = 429;
        res.setHeader('Retry-After', '30');
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Request-Id', String(req.headers['x-request-id']));
      res.setHeader('X-Internal-Detail', 'do-not-leak');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

function call(path: string, init: RequestInit = {}) {
  const url = new URL(`http://app.test/api/${path}`);
  const segments = url.pathname.replace('/api/', '').split('/').map(decodeURIComponent);
  return proxyToBackend(new Request(url, init), segments, { API_URL: apiUrl, PROXY_SECRET });
}

describe('같은 오리진 프록시', () => {
  it('[결정 0004] /api를 떼고 경로와 쿼리를 백엔드로 넘긴다', async () => {
    const res = await call('products?limit=20&cursor=abc');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(seen.at(-1)).toMatchObject({ method: 'GET', url: '/products?limit=20&cursor=abc' });
  });

  it('[AC-CM-13] 요청 ID를 만들어 백엔드에 넘기고 같은 값을 응답 헤더로 돌려준다', async () => {
    const res = await call('healthz');
    const sent = seen.at(-1)?.headers['x-request-id'];
    expect(sent).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('X-Request-Id')).toBe(sent);
  });

  it('[AC-CM-31] 브라우저의 Origin · 쿠키 · 본문을 그대로 넘긴다', async () => {
    await call('products', {
      method: 'POST',
      headers: { Origin: 'http://app.test', Cookie: 'nb_session=abc', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '원목 의자' }),
    });
    const last = seen.at(-1);
    expect(last?.method).toBe('POST');
    expect(last?.headers.origin).toBe('http://app.test');
    expect(last?.headers.cookie).toBe('nb_session=abc');
    expect(last?.body).toBe('{"title":"원목 의자"}');
  });

  it('[T-02] 브라우저가 보낸 X-Client-IP · X-Proxy-Secret은 버리고 원 IP와 공유 비밀을 붙인다', async () => {
    await call('auth/login', {
      method: 'POST',
      headers: {
        'X-Client-IP': '6.6.6.6',
        'X-Proxy-Secret': 'forged',
        'X-Forwarded-For': '203.0.113.7, 10.0.0.1',
      },
      body: '{}',
    });
    const last = seen.at(-1);
    expect(last?.headers['x-client-ip']).toBe('203.0.113.7');
    expect(last?.headers['x-proxy-secret']).toBe(PROXY_SECRET);
  });

  it('세션 연장 쿠키(Set-Cookie 여러 개)와 Retry-After를 그대로 돌려주고, 그 밖의 헤더는 버린다', async () => {
    const login = await call('login', { method: 'POST', body: '{}' });
    expect(login.headers.getSetCookie()).toEqual(['nb_session=abc; HttpOnly; Path=/', 'other=1; Path=/']);
    expect(login.headers.get('X-Internal-Detail')).toBeNull();
    expect(login.headers.get('Cache-Control')).toBe('no-store');

    const limited = await call('limited');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('30');
  });

  it('경로 조각은 다시 인코딩되어 백엔드 주소 밖으로 나가지 못한다', async () => {
    const before = seen.length;
    const config = { API_URL: apiUrl, PROXY_SECRET };
    // Next.js가 디코드해 넘긴 조각에 '..'이 들어온 경우
    const dots = await proxyToBackend(new Request('http://app.test/api/x'), ['products', '..', 'admin'], config);
    expect(dots.status).toBe(404);
    expect(seen.length).toBe(before);

    await call('products/a%2Fb%3Fx=1');
    expect(seen.at(-1)?.url).toBe('/products/a%2Fb%3Fx%3D1');
  });

  it('백엔드에 닿지 못하면 502와 약속한 에러 모양 · 요청 ID를 준다', async () => {
    const res = await proxyToBackend(new Request('http://app.test/api/healthz'), ['healthz'], {
      API_URL: 'http://127.0.0.1:1',
      PROXY_SECRET,
    });
    expect(res.status).toBe(502);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe('INTERNAL');
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

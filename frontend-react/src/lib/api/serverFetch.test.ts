// @vitest-environment node
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchBackendForRender } from './serverFetch';

const PROXY_SECRET = 'proxy-secret-0123456789-0123456789';
let backend: Server;
let redirectTarget: Server;
let apiUrl: string;
let redirectTargetUrl: string;
let backendHeaders: IncomingHttpHeaders | undefined;
let redirectTargetHits = 0;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  redirectTarget = createServer((_req, res) => {
    redirectTargetHits += 1;
    res.end('비밀값이 도착하면 안 된다');
  });
  redirectTargetUrl = await listen(redirectTarget);

  backend = createServer((req, res) => {
    backendHeaders = req.headers;
    if (req.url === '/redirect') {
      res.statusCode = 302;
      res.setHeader('Location', `${redirectTargetUrl}/stolen`);
    }
    res.end('backend');
  });
  apiUrl = await listen(backend);
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => backend.close((err) => (err === undefined ? resolve() : reject(err)))),
    new Promise<void>((resolve, reject) => redirectTarget.close((err) => (err === undefined ? resolve() : reject(err)))),
  ]);
});

describe('서버 렌더링 백엔드 요청', () => {
  it('다른 오리진으로 향하는 302를 따라가지 않아 공유 비밀과 세션을 보내지 않는다', async () => {
    const response = await fetchBackendForRender(
      '/redirect',
      { API_URL: apiUrl, PROXY_SECRET },
      'session-value',
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${redirectTargetUrl}/stolen`);
    expect(backendHeaders?.['x-proxy-secret']).toBe(PROXY_SECRET);
    expect(backendHeaders?.cookie).toBe('nb_session=session-value');
    expect(redirectTargetHits).toBe(0);
  });

  it('프로토콜 상대 경로는 요청 전에 거부한다', async () => {
    const port = (redirectTarget.address() as AddressInfo).port;
    await expect(
      fetchBackendForRender(
        `//127.0.0.1:${port}/stolen`,
        { API_URL: apiUrl, PROXY_SECRET },
        undefined,
      ),
    ).rejects.toThrow('백엔드 경로');
    expect(redirectTargetHits).toBe(0);
  });
});

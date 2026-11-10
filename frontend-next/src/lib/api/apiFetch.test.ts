import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, describeApiError } from './ApiError';
import { apiFetch } from './apiFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const mock = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('실패해야 한다');
}

describe('apiFetch', () => {
  it('[결정 0004] 같은 오리진의 /api 아래로 JSON을 보낸다', async () => {
    const mock = stubFetch(Response.json({ ok: true }));
    await apiFetch('/auth/login', { method: 'POST', body: { email: 'a@b.co' } });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"email":"a@b.co"}');
  });

  it('서버 에러 응답을 code · fields · 요청 ID · Retry-After가 담긴 ApiError로 바꾼다', async () => {
    stubFetch(
      Response.json(
        { error: { code: 'RATE_LIMITED', message: '잠시 후 다시 시도해 주세요', fields: null } },
        { status: 429, headers: { 'X-Request-Id': 'abcdef123456', 'Retry-After': '30' } },
      ),
    );
    const error = await caught(apiFetch('/auth/login'));
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429, requestId: 'abcdef123456', retryAfter: 30 });
  });

  it('fetch가 던지면 NETWORK, 약속한 모양이 아닌 실패는 INTERNAL이다', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect((await caught(apiFetch('/me'))).code).toBe('NETWORK');

    stubFetch(new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'X-Request-Id': 'abcdef123456' } }));
    const error = await caught(apiFetch('/me'));
    expect(error.code).toBe('INTERNAL');
    // 5xx는 요청 ID 앞 6자를 문의 번호로 보여준다 [AC-CM-13]
    expect(describeApiError(error)).toBe('일시적인 문제가 생겼어요 (문의 번호 abcdef)');
  });

  it('204는 본문 없이 끝난다', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

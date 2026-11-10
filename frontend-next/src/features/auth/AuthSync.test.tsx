import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSync } from './AuthSync';
import { SessionProvider } from './SessionProvider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const user = { id: 'u1', email: 'kim@example.com', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-10T00:00:00.000Z' };

describe('세션 연장 요청', () => {
  it('[AC-CM-03] 로그인 상태로 열면 브라우저가 /api/me를 한 번 불러 연장 쿠키를 받을 수 있게 한다', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ user })));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(
      <SessionProvider user={user}>
        <AuthSync />
      </SessionProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/me');
    // 같은 사용자로 다시 그려져도 또 부르지 않는다
    rerender(
      <SessionProvider user={{ ...user }}>
        <AuthSync />
      </SessionProvider>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('비로그인이면 부르지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <SessionProvider user={null}>
        <AuthSync />
      </SessionProvider>,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

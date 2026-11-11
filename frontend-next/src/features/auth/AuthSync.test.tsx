import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSync } from './AuthSync';
import { SessionProvider } from './SessionProvider';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const user = { id: 'u1', email: 'kim@example.com', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-10T00:00:00.000Z', isDemo: false };

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

describe('다른 탭의 로그인 · 로그아웃', () => {
  // storage 이벤트는 다른 탭에서 값을 썼을 때만 온다
  const fromOtherTab = (event: object) =>
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nb:auth-event', newValue: JSON.stringify({ ...event, at: 1 }) }));
    });
  const mount = (current: typeof user | null) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ user }))));
    return render(
      <SessionProvider user={current}>
        <AuthSync />
      </SessionProvider>,
    );
  };

  it('[AC-LI-14] 다른 탭에서 로그아웃하면 이 탭은 문서를 새로 받아 로그인 화면으로 간다', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    mount(user);
    fromOtherTab({ type: 'logout' });
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('[AC-LI-15] 다른 탭에서 다른 계정으로 로그인하면 새로고침 안내가 뜬다. 같은 계정이면 뜨지 않는다', () => {
    mount(user);
    fromOtherTab({ type: 'login', userId: 'u1' });
    expect(screen.queryByRole('alert')).toBeNull();
    fromOtherTab({ type: 'login', userId: 'u2' });
    expect(screen.getByRole('alert').textContent).toContain('다른 계정으로 로그인됐어요. 새로고침해 주세요');
  });

  it('비로그인 탭은 다른 탭의 로그인을 받아 화면을 새로 그린다', () => {
    refresh.mockClear();
    mount(null);
    fromOtherTab({ type: 'login', userId: 'u1' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

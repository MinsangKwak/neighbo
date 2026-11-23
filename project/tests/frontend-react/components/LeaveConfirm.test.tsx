import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveGuard } from '@/lib/form/leaveGuard';
import { useLeaveGuard } from '@/lib/form/useLeaveGuard';
import { LeaveConfirm } from '../../../../frontend-react/src/components/LeaveConfirm';

const router = { push: vi.fn(), back: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  vi.clearAllMocks();
  act(() => leaveGuard.cancel());
});

// 가로채기는 Link가 그린 결과인 a[href]만 본다 — Link 대신 a를 그대로 그린다
const LINKS = [
  ['채팅', '/chats', undefined],
  ['새 탭', '/chats', '_blank'],
  ['바깥', 'https://example.com/', undefined],
] as const;

function Page({ dirty, onReady }: { dirty: boolean; onReady?: (allow: () => void) => void }) {
  const leave = useLeaveGuard(dirty);
  onReady?.(leave.allow);
  return (
    <>
      {LINKS.map(([name, href, target]) => createElement('a', { key: name, href, target }, name))}
      <LeaveConfirm />
    </>
  );
}

// 링크를 눌렀을 때 브라우저 이동이 막혔는지 — jsdom은 실제로 이동하지 않으므로 defaultPrevented로 본다
const click = (name: string, init: MouseEventInit = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  act(() => {
    screen.getByRole('link', { name }).dispatchEvent(event);
  });
  return event.defaultPrevented;
};
const dialog = () => screen.queryByRole('alertdialog', { hidden: true });
const isOpen = () => dialog()?.hasAttribute('open') ?? false;

describe('앱 안 이동의 이탈 확인', () => {
  it('[AC-PC-04, AC-MP-10] 고친 내용이 없으면 링크를 막지 않는다', () => {
    render(<Page dirty={false} />);
    expect(click('채팅')).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('[AC-PC-04, AC-MP-10] 고친 내용이 있으면 앱 안 링크에서 먼저 묻고, [계속 작성]이면 머문다', () => {
    render(<Page dirty />);
    expect(click('채팅')).toBe(true);
    expect(isOpen()).toBe(true);
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '계속 작성', hidden: true }));
    expect(isOpen()).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('[AC-PC-04, AC-MP-10] [나가기]를 누르면 누른 링크로 가고, 그 뒤로는 묻지 않는다', () => {
    render(<Page dirty />);
    click('채팅');
    fireEvent.click(screen.getByRole('button', { name: '나가기', hidden: true }));
    expect(router.push).toHaveBeenCalledWith('/chats');
    expect(isOpen()).toBe(false);
    expect(leaveGuard.isBlocking()).toBe(false);
  });

  it('새 탭 · 수정 키 · 바깥 주소는 브라우저에 맡긴다', () => {
    render(<Page dirty />);
    expect(click('새 탭')).toBe(false);
    expect(click('채팅', { metaKey: true })).toBe(false);
    expect(click('바깥')).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('저장해 allow()를 부른 폼은 묻지 않는다', () => {
    let allow: () => void = () => undefined;
    render(<Page dirty onReady={(fn) => (allow = fn)} />);
    allow();
    expect(click('채팅')).toBe(false);
  });

  it('[AC-NT-05] 토스트 · 뒤로 버튼처럼 코드가 하는 이동도 같은 확인을 거친다', () => {
    const view = render(<Page dirty />);
    const go = vi.fn();
    act(() => leaveGuard.request(go));
    expect(go).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '나가기', hidden: true }));
    expect(go).toHaveBeenCalledTimes(1);

    // 폼이 없으면 바로 간다
    view.unmount();
    const direct = vi.fn();
    leaveGuard.request(direct);
    expect(direct).toHaveBeenCalledTimes(1);
  });
});

import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyProductCard, PurchaseCard, UserSelf } from '@neighbo/shared-schema';
import { ToastProvider } from '@/components/Toast';
import { makeQueryClient } from '@/lib/query/QueryProvider';
import { MyTabs } from './MyTabs';
import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/me' }));

type Reply = { status: number; body: unknown };
let handler: (url: string, init?: RequestInit) => Reply;
let calls: { url: string; method: string; body: unknown }[];
const assign = vi.fn();

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockClear());
  assign.mockClear();
  calls = [];
  handler = () => ({ status: 200, body: {} });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const reply = handler(url, init);
      return Promise.resolve(reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status }));
    }),
  );
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

const seller = { id: 'u2', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z' };
const user: UserSelf = { id: 'me', nickname: '테스터', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z', email: 'me@example.com', isDemo: false };
const counts = { onSale: 3, reserved: 0, sold: 1200, purchased: 2 };
const card = (id: string, extra: Partial<MyProductCard> = {}): MyProductCard => ({
  id,
  title: `상품 ${id}`,
  price: 15000,
  status: 'ON_SALE',
  thumbnail: null,
  chatRoomCount: 0,
  createdAt: '2026-11-10T00:00:00.000Z',
  buyer: null,
  ...extra,
});
const purchase = (id: string, extra: Partial<PurchaseCard> = {}): PurchaseCard => ({
  id,
  title: `구매 ${id}`,
  soldPrice: 9000,
  thumbnail: null,
  seller,
  soldAt: '2026-11-10T00:00:00.000Z',
  deleted: false,
  ...extra,
});

describe('마이페이지 탭', () => {
  it('[AC-MP-02] 탭 이름에 개수가 들어가고, 선택된 탭만 Tab 순서에 든다', async () => {
    handler = () => ({ status: 200, body: { items: [card('1')], nextCursor: null } });
    wrap(<MyTabs tab="ON_SALE" counts={counts} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['판매중 3개', '예약중 0개', '거래완료 999+개', '구매 2개']);
    expect(tabs.map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex])).toEqual([
      ['true', 0],
      ['false', -1],
      ['false', -1],
      ['false', -1],
    ]);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
    expect(await screen.findByText('상품 1')).toBeTruthy();
    expect(calls[0]!.url).toBe('/api/me/products?limit=20&status=ON_SALE');
  });

  it('[AC-MP-02] 누르거나 화살표로 옮기면 주소의 status가 바뀌고 포커스는 탭에 남는다', () => {
    handler = () => ({ status: 200, body: { items: [], nextCursor: null } });
    wrap(<MyTabs tab="ON_SALE" counts={counts} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[2]!);
    expect(router.replace).toHaveBeenLastCalledWith('/me?status=SOLD', { scroll: false });
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(router.replace).toHaveBeenLastCalledWith('/me?status=RESERVED', { scroll: false });
    expect(document.activeElement).toBe(tabs[1]);
    // 처음에서 왼쪽이면 끝으로
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(router.replace).toHaveBeenLastCalledWith('/me?status=PURCHASED', { scroll: false });
    fireEvent.keyDown(tabs[0]!, { key: 'End' });
    expect(document.activeElement).toBe(tabs[3]);
  });

  it('[AC-MP-05] 탭마다 빈 상태 문구가 다르고 판매중에만 [물건 올리기]가 있다', async () => {
    handler = () => ({ status: 200, body: { items: [], nextCursor: null } });
    const { unmount } = wrap(<MyTabs tab="ON_SALE" counts={counts} />);
    expect(await screen.findByText('판매 중인 물건이 없어요')).toBeTruthy();
    expect(screen.getByRole('link', { name: '물건 올리기' }).getAttribute('href')).toBe('/products/new');
    unmount();
    wrap(<MyTabs tab="PURCHASED" counts={counts} />);
    expect(await screen.findByText('아직 구매한 물건이 없어요')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '물건 올리기' })).toBeNull();
  });

  it('[AC-MP-03] 거래완료 카드에 구매자가 보인다', async () => {
    handler = () => ({
      status: 200,
      body: { items: [card('1', { status: 'SOLD', buyer: seller, chatRoomCount: 2 }), card('2', { status: 'SOLD' })], nextCursor: null },
    });
    wrap(<MyTabs tab="SOLD" counts={counts} />);
    const links = await screen.findAllByRole('link');
    expect(within(links[0]!).getByText('김당근님과 거래')).toBeTruthy();
    expect(within(links[0]!).getByText('채팅 2')).toBeTruthy();
    expect(within(links[1]!).queryByText(/님과 거래/)).toBeNull();
  });

  it('[AC-MP-04] 구매 내역은 거래 시점 가격으로 보이고, 삭제된 상품은 "삭제됨"이며 누를 수 없다', async () => {
    handler = () => ({ status: 200, body: { items: [purchase('1'), purchase('2', { deleted: true })], nextCursor: null } });
    wrap(<MyTabs tab="PURCHASED" counts={counts} />);
    expect(await screen.findByText('구매 1')).toBeTruthy();
    expect(calls[0]!.url).toBe('/api/me/purchases?limit=20');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/products/1']);
    expect(within(links[0]!).getByText('9,000원')).toBeTruthy();
    expect(screen.getByText('삭제됨')).toBeTruthy();
    expect(screen.getAllByText('김당근님에게 구매')).toHaveLength(2);
  });

  it('[MP-NW-01] 목록이 실패하면 탭은 그대로 두고 목록 자리에 [다시 시도]', async () => {
    handler = () => ({ status: 500, body: { error: { code: 'INTERNAL', message: '일시적인 문제가 생겼어요', fields: null } } });
    wrap(<MyTabs tab="ON_SALE" counts={counts} />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });
});

describe('프로필 수정', () => {
  it('[AC-MP-06] 바뀐 닉네임만 보내고, 저장하면 마이로 돌아가 새로 그린다', async () => {
    handler = () => ({ status: 200, body: { user: { ...user, nickname: '새 이름' } } });
    wrap(<ProfileForm user={user} />);
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '  새  이름 ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/me'));
    expect(calls).toEqual([{ url: '/api/me', method: 'PATCH', body: { nickname: '새 이름' } }]);
    expect(router.refresh).toHaveBeenCalled();
  });

  it('[AC-MP-06] 규칙에 어긋나면 보내지 않고, 남이 쓰는 닉네임이면 칸 아래에 알린다', async () => {
    wrap(<ProfileForm user={user} />);
    const input = screen.getByLabelText('닉네임');
    fireEvent.change(input, { target: { value: '가' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('2~12자로 입력해 주세요')).toBeTruthy();
    expect(calls).toEqual([]);

    handler = () => ({
      status: 409,
      body: { error: { code: 'NICKNAME_TAKEN', message: '이미 사용 중인 닉네임이에요', fields: { nickname: '이미 사용 중인 닉네임이에요' } } },
    });
    fireEvent.change(input, { target: { value: '김당근' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('[AC-MP-08] [기본 이미지로]를 누르면 avatarUploadId: null을 보낸다. 사진이 없으면 그 버튼도 없다', async () => {
    handler = () => ({ status: 200, body: { user } });
    const { unmount } = wrap(<ProfileForm user={user} />);
    expect(screen.queryByRole('button', { name: '기본 이미지로' })).toBeNull();
    unmount();
    wrap(<ProfileForm user={{ ...user, avatarUrl: '/api/files/avatars/a.webp' }} />);
    fireEvent.click(screen.getByRole('button', { name: '기본 이미지로' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(calls).toEqual([{ url: '/api/me', method: 'PATCH', body: { avatarUploadId: null } }]));
  });

  it('[AC-LI-19] 둘러보기 계정은 폼 대신 바꿀 수 없는 이유를 보여준다', () => {
    wrap(<ProfileForm user={{ ...user, isDemo: true }} />);
    expect(screen.getByText(/둘러보기 계정은 여러 사람이 함께 써서 프로필을 바꿀 수 없어요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });
});

describe('비밀번호 변경', () => {
  const fill = (current: string, next: string, confirm = next) => {
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: current } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: next } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  };

  it('[AC-MP-09] 성공하면 문서를 새로 받아 새 세션으로 이어 간다', async () => {
    handler = () => ({ status: 204, body: null });
    wrap(<PasswordForm isDemo={false} />);
    fill('correct horse', 'battery staple');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/me'));
    expect(calls[0]).toEqual({
      url: '/api/me/password',
      method: 'PATCH',
      body: { currentPassword: 'correct horse', newPassword: 'battery staple', newPasswordConfirm: 'battery staple' },
    });
    expect(sessionStorage.getItem('nb:flash')).toContain('비밀번호를 바꿨어요');
  });

  it('[AC-MP-09] 확인이 다르거나 현재와 같으면 보내지 않고 칸 아래에 알린다', async () => {
    wrap(<PasswordForm isDemo={false} />);
    fill('correct horse', 'battery staple', 'battery stapl');
    expect(await screen.findByText('비밀번호가 일치하지 않아요')).toBeTruthy();
    fill('correct horse', 'correct horse');
    expect(await screen.findByText('지금 쓰는 비밀번호와 달라야 해요')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('[AC-MP-09] 현재 비밀번호가 틀리면 그 칸에 알리고 머문다', async () => {
    handler = () => ({
      status: 400,
      body: { error: { code: 'WRONG_PASSWORD', message: '비밀번호가 맞지 않아요', fields: { currentPassword: '비밀번호가 맞지 않아요' } } },
    });
    wrap(<PasswordForm isDemo={false} />);
    fill('wrong one', 'battery staple');
    expect(await screen.findByText('비밀번호가 맞지 않아요')).toBeTruthy();
    expect(screen.getByLabelText('현재 비밀번호').getAttribute('aria-invalid')).toBe('true');
    expect(assign).not.toHaveBeenCalled();
  });

  it('[MP-A11Y-05] 자동 완성 속성이 칸의 뜻과 맞는다', () => {
    wrap(<PasswordForm isDemo={false} />);
    expect(screen.getByLabelText('현재 비밀번호').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByLabelText('새 비밀번호').getAttribute('autocomplete')).toBe('new-password');
  });

  it('[AC-LI-19] 둘러보기 계정은 바꿀 수 없다', () => {
    wrap(<PasswordForm isDemo />);
    expect(screen.getByText(/둘러보기 계정은 여러 사람이 함께 써서 비밀번호를 바꿀 수 없어요/)).toBeTruthy();
  });
});

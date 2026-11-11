import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductCard as Card, ProductDetail, Upload } from '@neighbo/shared-schema';
import { ProductCard } from '@/components/ProductCard';
import { ToastProvider } from '@/components/Toast';
import { makeQueryClient } from '@/lib/query/QueryProvider';
import { FavoriteButton } from './FavoriteButton';
import { UnreadableImageError } from './imageUpload';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';
import { HideSoldToggle, NearToggle } from './QueryToggle';
import { SearchForm } from './SearchForm';
import { SellerControls } from './SellerControls';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
let searchParams = '';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(searchParams),
}));

type Reply = { status: number; body: unknown };
let handler: (url: string, init?: RequestInit) => Reply;
let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockClear());
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrap(ui: ReactNode) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const card = (n: number, extra: Partial<Card> = {}): Card => ({
  id: `p${n}`,
  title: `상품 ${n}`,
  price: 1000 * n,
  status: 'ON_SALE',
  thumbnail: null,
  chatRoomCount: 0,
  neighborhood: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  ...extra,
});

const detail = (extra: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 'p1',
  title: '원목 의자',
  price: 15000,
  description: '상태 좋아요',
  status: 'ON_SALE',
  images: [],
  seller: { id: 'u1', nickname: '김당근', avatarUrl: null, neighborhood: null, createdAt: '2026-11-01T00:00:00.000Z' },
  chatRoomCount: 0,
  neighborhood: null,
  favoriteCount: 0,
  soldAt: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  ...extra,
});

describe('ProductCard', () => {
  it('[AC-PL-05] 카드 전체가 링크 하나이고 제목 → 가격 → 상태 → 시간 순서로 읽힌다', () => {
    render(<ProductCard product={card(1, { status: 'RESERVED', chatRoomCount: 120, price: 0 })} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/products/p1');
    expect(within(link).queryByRole('button')).toBeNull();
    const text = link.textContent ?? '';
    expect(text.indexOf('상품 1')).toBeLessThan(text.indexOf('나눔'));
    expect(text.indexOf('나눔')).toBeLessThan(text.indexOf('예약중'));
    // [AC-PL-11] 100 이상은 99+
    expect(text).toContain('채팅 99+');
  });

  it('[AC-PL-02, 09] 거래완료는 흐리게 보이지만 누를 수 있고, 사진이 없으면 자리 표시가 나온다', () => {
    render(<ProductCard product={card(1, { status: 'SOLD' })} />);
    const link = screen.getByRole('link');
    // 카드 전체가 아니라 제목 색으로 끝난 거래를 알린다 — 전체를 흐리면 글자 명암비가 기준 아래로 떨어진다
    expect(link.className).not.toContain('opacity');
    expect(within(link).getByText('상품 1').className).toContain('text-text-muted');
    expect(within(link).getByText('거래완료')).toBeDefined();
    expect(within(link).getByText('사진 없음')).toBeDefined();
    expect(within(link).queryByText(/채팅/)).toBeNull();
  });
});

describe('ProductList', () => {
  const filters = { q: null, hideSold: false };
  const empty = <p>아직 올라온 물건이 없어요</p>;

  it('[AC-PL-06] 카드는 폭에 관계없이 2열로 놓인다', async () => {
    handler = () => ({ status: 200, body: { items: [card(1), card(2), card(3)], nextCursor: null } });
    wrap(<ProductList filters={filters} empty={empty} />);
    const list = (await screen.findByRole('link', { name: /상품 1/ })).closest('ul')!;
    // 화면 폭에 따라 바뀌는 열 수(sm: · md:)를 두지 않는다
    expect(list.className.split(' ').filter((name) => name.includes('grid-cols'))).toEqual(['grid-cols-2']);
  });

  it('[AC-PL-03] [더 보기]를 누르면 다음 장을 붙이고 새 첫 카드로 포커스하며 개수를 알린다. 다음이 없으면 버튼이 없다', async () => {
    handler = (url) =>
      url.includes('cursor=c1')
        ? { status: 200, body: { items: [card(3), card(4)], nextCursor: null } }
        : { status: 200, body: { items: [card(1), card(2)], nextCursor: 'c1' } };
    wrap(<ProductList filters={filters} empty={empty} />);
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(4));
    expect(calls[1]?.url).toBe('/api/products?limit=20&cursor=c1');
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('link')[2]));
    expect(screen.getByText('2개 더 불러왔어요').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
  });

  it('[AC-PL-10] 하나도 없으면 빈 상태를 보여준다', async () => {
    handler = () => ({ status: 200, body: { items: [], nextCursor: null } });
    wrap(<ProductList filters={filters} empty={empty} />);
    expect(await screen.findByText('아직 올라온 물건이 없어요')).toBeDefined();
  });

  it('[AC-CM-21] 첫 조회가 실패하면 본문 자리에 [다시 시도]가 나오고, 누르면 다시 가져온다', async () => {
    let fail = true;
    handler = () =>
      fail
        ? { status: 500, body: { error: { code: 'INTERNAL', message: '일시적인 문제가 생겼어요', fields: null } } }
        : { status: 200, body: { items: [card(1)], nextCursor: null } };
    wrap(<ProductList filters={filters} empty={empty} />);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.getByText('불러오지 못했어요')).toBeDefined();
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByRole('link')).toBeDefined();
  });

  it('[AC-PL-15] [더 보기]가 실패하면 기존 항목은 그대로 두고 버튼 자리에 알린다', async () => {
    handler = (url) =>
      url.includes('cursor=')
        ? { status: 500, body: { error: { code: 'INTERNAL', message: 'x', fields: null } } }
        : { status: 200, body: { items: [card(1), card(2)], nextCursor: 'c1' } };
    wrap(<ProductList filters={filters} empty={empty} />);
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeDefined();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('불러오지 못했어요').getAttribute('role')).toBe('alert');
  });
});

describe('FavoriteButton', () => {
  const button = (props: Partial<Parameters<typeof FavoriteButton>[0]> = {}) =>
    wrap(<FavoriteButton productId="p1" loggedIn initial={{ on: false, count: 2 }} {...props} />);

  it('[AC-FV-08] 누르는 즉시 켜지고 개수가 오른다. 응답의 값으로 맞춘다', async () => {
    handler = () => ({ status: 200, body: { isFavorite: true, favoriteCount: 5 } });
    button();
    const el = screen.getByRole('button', { name: '관심 2' });
    expect(el.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(el);

    // 응답 전에 이미 바뀌어 있다
    expect(screen.getByRole('button', { name: '관심 3' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(screen.getByRole('button', { name: '관심 5' })).toBeDefined());
    expect(calls).toEqual([{ url: '/api/products/p1/favorite', method: 'PUT', body: undefined }]);
  });

  it('[AC-FV-08] 켜져 있으면 끄는 요청을 보낸다', async () => {
    handler = () => ({ status: 200, body: { isFavorite: false, favoriteCount: 1 } });
    button({ initial: { on: true, count: 2 } });

    fireEvent.click(screen.getByRole('button', { name: '관심 2' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '관심 1' }).getAttribute('aria-pressed')).toBe('false'));
    expect(calls[0]).toMatchObject({ method: 'DELETE' });
  });

  it('[AC-FV-08] 응답을 기다리는 동안 다시 눌러도 요청은 하나다', async () => {
    handler = () => ({ status: 200, body: { isFavorite: true, favoriteCount: 3 } });
    button();
    const el = screen.getByRole('button', { name: '관심 2' });

    fireEvent.click(el);
    fireEvent.click(el);

    await waitFor(() => expect(screen.getByRole('button', { name: '관심 3' })).toBeDefined());
    expect(calls).toHaveLength(1);
  });

  it('[AC-FV-08] 실패하면 되돌리고 이유를 알린다', async () => {
    handler = () => ({ status: 500, body: { error: { code: 'INTERNAL', message: '서버 오류' } } });
    button();

    fireEvent.click(screen.getByRole('button', { name: '관심 2' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('button', { name: '관심 2' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('[AC-FV-05] 서버가 새 값을 보내면 따라간다 — 다른 탭에서 로그인한 뒤 끄는 요청이 나간다', async () => {
    handler = () => ({ status: 200, body: { isFavorite: false, favoriteCount: 2 } });
    const view = button({ loggedIn: false, initial: { on: false, count: 3 } });
    const again = (
      <QueryClientProvider client={makeQueryClient()}>
        <ToastProvider>
          <FavoriteButton productId="p1" loggedIn initial={{ on: true, count: 3 }} />
        </ToastProvider>
      </QueryClientProvider>
    );

    view.rerender(again);

    const el = screen.getByRole('button', { name: '관심 3' });
    expect(el.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(el);
    await waitFor(() => expect(calls[0]).toMatchObject({ method: 'DELETE' }));
  });

  it('[AC-FV-04] 비로그인이면 로그인으로 보내고 요청하지 않는다', () => {
    button({ loggedIn: false });
    fireEvent.click(screen.getByRole('button', { name: '관심 2' }));
    expect(router.push).toHaveBeenCalledWith('/login?next=%2Fproducts%2Fp1');
    expect(calls).toEqual([]);
  });
});

describe('SearchForm', () => {
  it('[AC-PL-12] 2자 미만이면 알리고, 정규화한 검색어를 주소에 싣는다', () => {
    render(<SearchForm />);
    const input = screen.getByRole('searchbox', { name: '물건 검색' });
    fireEvent.change(input, { target: { value: ' 가 ' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(screen.getByRole('alert').textContent).toBe('2자 이상 입력해 주세요');
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  원목  의자 ' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(router.push).toHaveBeenCalledWith('/search?q=%EC%9B%90%EB%AA%A9%20%EC%9D%98%EC%9E%90');
  });
});

describe('SellerControls', () => {
  it('[AC-PD-03] 거래 상태 select는 지금 갈 수 있는 상태만 보여주고, 고르면 바로 요청하고 결과를 알린다', async () => {
    handler = () => ({ status: 200, body: { product: detail({ status: 'RESERVED' }) } });
    wrap(<SellerControls product={detail()} />);
    const select = screen.getByLabelText('거래 상태');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['판매중', '예약중', '거래완료']);
    fireEvent.change(select, { target: { value: 'RESERVED' } });
    await waitFor(() => expect(calls[0]).toMatchObject({ url: '/api/products/p1/status', method: 'PATCH', body: { status: 'RESERVED' } }));
    expect((await screen.findByText('예약중(으)로 바꿨어요')).getAttribute('role')).toBe('status');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('[AC-PD-04] 거래완료를 고르면 대화 상대와 "선택 안 함"을 묻고, 고른 사람을 구매자로 보낸다', async () => {
    handler = (url) =>
      url.includes('chat-partners')
        ? { status: 200, body: { items: [{ roomId: 'r1', user: { id: 'u2', nickname: '구매왕', avatarUrl: null, neighborhood: null, createdAt: '2026-11-01T00:00:00.000Z' }, lastActivityAt: '2026-11-10T00:00:00.000Z' }] } }
        : { status: 200, body: { product: detail({ status: 'SOLD' }) } };
    wrap(<SellerControls product={detail()} />);
    fireEvent.change(screen.getByLabelText('거래 상태'), { target: { value: 'SOLD' } });
    expect(screen.getByRole('heading', { name: '누구와 거래했나요?' })).toBeDefined();
    expect(screen.getByRole('button', { name: '선택 안 함' })).toBeDefined();
    fireEvent.click(await screen.findByRole('button', { name: '구매왕' }));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ status: 'SOLD', buyerId: 'u2' }));
    // 성공해서 창이 닫혀도 선택값이 이전 상태로 돌아가지 않는다
    await waitFor(() => expect(screen.queryByRole('heading', { name: '누구와 거래했나요?' })).toBeNull());
    expect((screen.getByLabelText('거래 상태') as HTMLSelectElement).value).toBe('SOLD');
  });

  it('[AC-PD-06] 거래완료에서 판매중으로는 "구매자 정보가 지워져요" 확인을 거친다', async () => {
    handler = () => ({ status: 200, body: { product: detail() } });
    wrap(<SellerControls product={detail({ status: 'SOLD' })} />);
    fireEvent.change(screen.getByLabelText('거래 상태'), { target: { value: 'ON_SALE' } });
    expect(screen.getByText('구매자 정보가 지워져요.')).toBeDefined();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(calls[0]?.body).toEqual({ status: 'ON_SALE' }));
    await waitFor(() => expect(screen.getByText('구매자 정보가 지워져요.').closest('dialog')?.hasAttribute('open')).toBe(false));
    expect((screen.getByLabelText('거래 상태') as HTMLSelectElement).value).toBe('ON_SALE');
  });

  it('[AC-PD-08] 실패하면 선택을 이전 값으로 되돌리고 알린다', async () => {
    handler = () => ({ status: 409, body: { error: { code: 'INVALID_TRANSITION', message: '지금 상태에서는 바꿀 수 없어요', fields: null } } });
    wrap(<SellerControls product={detail()} />);
    const select = screen.getByLabelText('거래 상태') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'RESERVED' } });
    expect(await screen.findByText('지금 상태에서는 바꿀 수 없어요')).toBeDefined();
    expect(select.value).toBe('ON_SALE');
  });

  it('[AC-PX-02, 03] 삭제는 alertdialog로 확인하고, 채팅이 있으면 문구가 바뀌며, 확정하면 홈으로 replace한다', async () => {
    handler = () => ({ status: 204, body: null });
    wrap(<SellerControls product={detail({ chatRoomCount: 2 })} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('alertdialog', { name: '이 물건을 삭제할까요?' });
    expect(within(dialog).getByText(/대화 중인 채팅 2개가 있어요/)).toBeDefined();
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(calls[0]).toMatchObject({ url: '/api/products/p1', method: 'DELETE' });
    expect(screen.getByText('삭제했어요')).toBeDefined();
  });
});

describe('ProductForm', () => {
  const uploaded = (id: string): Upload => ({ id, url: `/api/files/${id}.webp`, thumbnailUrl: `/api/files/${id}.thumb.webp`, width: 800, height: 600 });
  const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
  const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
  const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('[AC-PC-05, 06] 제목 글자 수를 보여주고, 가격은 입력 중 콤마가 붙으며, 나눔을 켜면 0으로 잠긴다', () => {
    wrap(<ProductForm />);
    type('제목', '원목 의자');
    expect(screen.getByText('5/40')).toBeDefined();
    const price = screen.getByLabelText('가격') as HTMLInputElement;
    expect(price.getAttribute('inputmode')).toBe('numeric');
    type('가격', '15000원');
    expect(price.value).toBe('15,000');
    fireEvent.click(screen.getByLabelText('나눔'));
    expect(price.value).toBe('0');
    expect(price.disabled).toBe(true);
  });

  it('[AC-CM-44] 제출하면 틀린 칸을 알리고 첫 오류 칸으로 포커스하며 서버를 부르지 않는다', () => {
    wrap(<ProductForm />);
    fireEvent.click(screen.getByRole('button', { name: '등록하기' }));
    expect(screen.getByText('제목을 입력해 주세요')).toBeDefined();
    expect(screen.getByText('가격을 입력해 주세요')).toBeDefined();
    const title = screen.getByLabelText('제목');
    expect(document.activeElement).toBe(title);
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it('[AC-PC-01, 02, 08] 사진 없이 등록하면 멱등 키와 함께 보내고 상세로 replace하며 토스트를 띄운다', async () => {
    handler = () => ({ status: 201, body: { product: detail({ id: 'new1' }) } });
    wrap(<ProductForm />);
    type('제목', ' 원목 의자 ');
    type('가격', '15000');
    type(/설명/, '상태 좋아요');
    fireEvent.click(screen.getByRole('button', { name: '등록하기' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/products/new1'));
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toMatchObject({ title: ' 원목 의자 ', price: 15000, description: '상태 좋아요', imageIds: [] });
    expect((sent?.body as { idempotencyKey: string }).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText('물건을 올렸어요')).toBeDefined();
  });

  it('[AC-PC-10, 16, 17, 20] 고른 사진은 바로 올라가고, 올리는 동안은 등록할 수 없으며, [대표로]로 순서를 바꾼다', async () => {
    const pending: ((upload: Upload) => void)[] = [];
    const upload = vi.fn(() => new Promise<Upload>((resolve) => pending.push(resolve)));
    handler = () => ({ status: 201, body: { product: detail({ id: 'new1' }) } });
    wrap(<ProductForm prepare={(f) => Promise.resolve(f)} upload={upload} />);
    type('제목', '원목 의자');
    type('가격', '1000');
    pick([file('a.jpg'), file('b.jpg')]);

    expect(await screen.findByText('사진 올리는 중 0/2')).toBeDefined();
    expect(screen.getByText(/사진 추가/).textContent).toContain('현재 2장');
    const submit = screen.getByRole('button', { name: '등록하기' });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(calls).toHaveLength(0);

    await waitFor(() => expect(pending).toHaveLength(2));
    pending[0]?.(uploaded('up-a'));
    pending[1]?.(uploaded('up-b'));
    await waitFor(() => expect(screen.queryByText(/사진 올리는 중/)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '2번째 사진을 대표로' }));
    fireEvent.click(screen.getByRole('button', { name: '등록하기' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({ imageIds: ['up-b', 'up-a'] }));
  });

  it('[AC-PC-11, 12, 15] 10장을 넘으면 앞 10장만 받고, 열 수 없는 사진은 이유와 [다시 시도]를 보여준다', async () => {
    const prepare = vi.fn((f: File) => {
      // 실제 prepareImage가 던지는 것과 같은 오류
      if (f.name === 'bad.heic') return Promise.reject(new UnreadableImageError());
      return Promise.resolve(f as Blob);
    });
    let n = 0;
    wrap(<ProductForm prepare={prepare} upload={() => Promise.resolve(uploaded(`up-${(n += 1)}`))} />);
    pick([file('bad.heic'), ...Array.from({ length: 11 }, (_, i) => file(`${i}.jpg`))]);
    expect(await screen.findByText('사진은 10장까지 올릴 수 있어요')).toBeDefined();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /번째 사진 삭제/ })).toHaveLength(10));
    expect(await screen.findByText('이 사진은 열 수 없어요. jpg · png로 바꿔 올려 주세요')).toBeDefined();
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeDefined();
    // 올리지 못한 사진이 있는 동안은 등록할 수 없다 — 그 사진이 말없이 빠지지 않게
    type('제목', '원목 의자');
    type('가격', '1000');
    const submit = screen.getByRole('button', { name: '등록하기' });
    expect(screen.getByText('올리지 못한 사진 1장을 다시 시도하거나 삭제해 주세요')).toBeDefined();
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(calls).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '1번째 사진 삭제' }));
    expect(screen.getAllByRole('button', { name: /번째 사진 삭제/ })).toHaveLength(9);
    expect(submit.getAttribute('aria-disabled')).toBeNull();
  });

  it('[AC-PC-30, 31, 33] 수정은 기존 값이 채워져 있고, 최종 사진 목록을 PATCH로 보낸 뒤 "수정했어요"를 띄운다', async () => {
    handler = () => ({ status: 200, body: { product: detail() } });
    const existing = detail({
      price: 0,
      images: [
        { id: 'i1', url: '/api/files/1.webp', thumbnailUrl: '/api/files/1.thumb.webp', width: 800, height: 600 },
        { id: 'i2', url: '/api/files/2.webp', thumbnailUrl: '/api/files/2.thumb.webp', width: 800, height: 600 },
      ],
    });
    wrap(<ProductForm product={existing} prepare={(f) => Promise.resolve(f)} upload={() => Promise.resolve(uploaded('up-new'))} />);
    expect(screen.getByLabelText('제목')).toHaveProperty('value', '원목 의자');
    expect((screen.getByLabelText('나눔') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '1번째 사진 삭제' }));
    pick([file('new.jpg')]);
    await waitFor(() => expect(screen.getByRole('button', { name: '2번째 사진을 대표로' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/products/p1'));
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({
      url: '/api/products/p1',
      body: { title: '원목 의자', price: 0, images: [{ imageId: 'i2' }, { uploadId: 'up-new' }] },
    });
    expect(screen.getByText('수정했어요')).toBeDefined();
  });

  it('[AC-PC-35, AC-CM-22] 저장할 때 이미 삭제됐으면 알리고 홈으로, 그 밖의 실패는 입력을 그대로 둔다', async () => {
    handler = () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: '찾을 수 없어요', fields: null } } });
    wrap(<ProductForm product={detail()} />);
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
    expect(await screen.findByText('삭제된 물건이에요')).toBeDefined();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('[AC-PC-04] 내용이 있으면 [취소]에서 나갈지 확인한다', () => {
    wrap(<ProductForm />);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    type('제목', '쓰던 글');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('alertdialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' })).toBeDefined();
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('UnreadableImageError', () => {
  it('이름이 지정되어 있어 사진 선택기가 "열 수 없는 사진"으로 알아본다', () => {
    const error = new UnreadableImageError();
    expect(error.name).toBe('UnreadableImageError');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('동네', () => {
  beforeEach(() => {
    searchParams = '';
  });

  it('AC-NB-06 카드는 동네가 있을 때만 동네를 보여준다', () => {
    const { unmount } = render(<ProductCard product={card(1, { neighborhood: '마포구' })} />);
    expect(screen.getByText('마포구')).toBeTruthy();
    unmount();
    render(<ProductCard product={card(2)} />);
    expect(screen.queryByText(/구$/)).toBeNull();
  });

  it('AC-NB-07 "내 동네만"을 켜면 주소에 near=1이 붙고, 다른 조건은 그대로 남는다', async () => {
    searchParams = 'hideSold=1';
    render(<NearToggle checked={false} neighborhood="마포구" />);
    const box = screen.getByRole('checkbox', { name: '내 동네만 (마포구)' });
    fireEvent.click(box);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/?hideSold=1&near=1', { scroll: false }));
  });

  it('AC-NB-07 끄면 near만 빠진다', async () => {
    searchParams = 'hideSold=1&near=1';
    render(
      <>
        <HideSoldToggle checked />
        <NearToggle checked neighborhood="마포구" />
      </>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '내 동네만 (마포구)' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/?hideSold=1', { scroll: false }));
  });
});

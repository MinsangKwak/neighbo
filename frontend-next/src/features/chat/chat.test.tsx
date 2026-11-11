import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatRoomDetail,
  ChatRoomItem,
  ChatRoomPage,
  ChatRoomResponse,
  Message,
  MessagePage,
  UserSelf,
} from '@neighbo/shared-schema';
import { ToastProvider } from '@/components/Toast';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { formatChatTime, formatClock, formatDateLine } from '@/lib/format';
import { makeQueryClient } from '@/lib/query/QueryProvider';
import { queryKeys } from '@/lib/query/queryKeys';
import { createChatSocket, type ChatSocket, type SocketLike } from '@/lib/socket/chatSocket';
import {
  addMessages,
  applyMessageToRooms,
  applyProduct,
  lastSeq,
  markRoomRead,
  setPartnerRead,
  uniqueRooms,
} from './cache';
import { ChatButton } from './ChatButton';
import { ChatList } from './ChatList';
import { ChatRoomScreen } from './ChatRoomScreen';
import { ChatSocketContext } from './ChatSocketProvider';
import { Composer } from './Composer';
import { UnreadBadge } from './UnreadBadge';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/chats',
  useSearchParams: () => new URLSearchParams(),
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
      return Promise.resolve(Response.json(reply.body, { status: reply.status }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ME = 'me';
const PARTNER = { id: 'u2', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z' };
const me: UserSelf = { id: ME, nickname: '나', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z', email: 'me@example.com', isDemo: false };
const product = { id: 'p1', title: '원목 의자', price: 15000, status: 'ON_SALE' as const, thumbnail: null, deleted: false };

// 로컬 시각 기준으로 만든다 — 표시 함수는 브라우저의 시간대를 따른다
const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).toISOString();

const msg = (seq: number, senderId: string, extra: Partial<Message> = {}): Message => ({
  id: `m${seq}`,
  roomId: 'room1',
  senderId,
  seq,
  content: `메시지 ${seq}`,
  tempId: `t${seq}`,
  createdAt: at(10, 15, seq),
  ...extra,
});

const row = (id: string, extra: Partial<ChatRoomItem> = {}): ChatRoomItem => ({
  id,
  product,
  partner: PARTNER,
  myRole: 'BUYER',
  lastMessage: null,
  unreadCount: 0,
  lastActivityAt: at(10, 12, 0),
  ...extra,
});

const detail = (extra: Partial<ChatRoomDetail> = {}): ChatRoomResponse => ({
  chatRoom: { id: 'room1', product, partner: PARTNER, myRole: 'BUYER', partnerLastReadSeq: 0, createdAt: at(9, 9, 0), ...extra },
});

const pages = <T,>(...items: T[][]): InfiniteData<{ items: T[]; nextCursor: string | null }, string | null> => ({
  pages: items.map((list, index) => ({ items: list, nextCursor: index === items.length - 1 ? null : `c${index}` })),
  pageParams: items.map((_, index) => (index === 0 ? null : `c${index - 1}`)),
});

describe('시각 표시', () => {
  it('[AC-CH-15] 말풍선 시각은 오전 · 오후 12시간제', () => {
    expect(formatClock(at(10, 0, 5))).toBe('오전 12:05');
    expect(formatClock(at(10, 9, 30))).toBe('오전 9:30');
    expect(formatClock(at(10, 12, 0))).toBe('오후 12:00');
    expect(formatClock(at(10, 15, 24))).toBe('오후 3:24');
    expect(formatDateLine(at(9, 15, 0))).toBe('2026년 11월 9일 (월)');
  });

  it('[AC-CL-12] 목록 시각은 오늘 · 어제 · N일 전 · 날짜 — 달력 날짜로 센다', () => {
    const now = new Date(2026, 10, 10, 1, 0);
    expect(formatChatTime(at(10, 0, 30), now)).toBe('오전 12:30');
    // 2시간 전이어도 날짜가 바뀌었으면 어제
    expect(formatChatTime(at(9, 23, 0), now)).toBe('어제');
    expect(formatChatTime(at(7, 23, 0), now)).toBe('3일 전');
    expect(formatChatTime(at(4, 12, 0), now)).toBe('6일 전');
    expect(formatChatTime(at(3, 12, 0), now)).toBe('11월 3일');
    expect(formatChatTime(new Date(2025, 11, 25, 12).toISOString(), now)).toBe('2025년 12월 25일');
  });
});

describe('소켓 이벤트 → 캐시', () => {
  const messagesOf = (client: QueryClient) =>
    client.getQueryData<InfiniteData<MessagePage, string | null>>(queryKeys.messages('room1'))!.pages[0]!.items.map((m) => m.seq);
  const roomsOf = (client: QueryClient, productId: string | null = null) =>
    client.getQueryData<InfiniteData<ChatRoomPage, string | null>>(queryKeys.chatRooms(productId))!.pages.map((page) => page.items);

  it('메시지는 가장 최근 페이지에 번호순으로 합치고, 같은 번호는 한 번만 넣는다', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.messages('room1'), pages([msg(4, ME), msg(3, ME)], [msg(2, ME), msg(1, ME)]));
    expect(lastSeq(client, 'room1')).toBe(4);
    // ack와 message:new, 누락분이 겹쳐 와도 된다. 순서가 뒤섞여 와도 된다
    addMessages(client, 'room1', [msg(6, 'u2'), msg(4, ME), msg(2, ME), msg(5, 'u2')]);
    addMessages(client, 'room1', [msg(6, 'u2')]);
    expect(messagesOf(client)).toEqual([6, 5, 4, 3]);
    expect(lastSeq(client, 'room1')).toBe(6);
  });

  it('열어 본 적 없는 방의 캐시는 만들지 않는다', () => {
    const client = new QueryClient();
    addMessages(client, 'room1', [msg(1, 'u2')]);
    expect(client.getQueryData(queryKeys.messages('room1'))).toBeUndefined();
    expect(lastSeq(client, 'room1')).toBeNull();
    // 메시지가 없는 방은 0 — 첫 메시지(1번)가 틈으로 보이지 않는다
    client.setQueryData(queryKeys.messages('room1'), pages<Message>([]));
    expect(lastSeq(client, 'room1')).toBe(0);
  });

  it('[AC-CL-05] 새 메시지가 온 방을 맨 위로 올리고 미리보기 · 배지를 고친다', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chatRooms(null), pages([row('a'), row('b')], [row('room1', { unreadCount: 2 })]));
    const message = msg(7, 'u2', { content: '첫 줄\n둘째 줄' });
    expect(applyMessageToRooms(client, message, { myId: ME, viewingRoomId: null })).toBe(true);
    const [first, second] = roomsOf(client);
    expect(first!.map((item) => item.id)).toEqual(['room1', 'a', 'b']);
    expect(second).toEqual([]);
    expect(first![0]).toMatchObject({
      unreadCount: 3,
      lastActivityAt: message.createdAt,
      lastMessage: { content: '첫 줄 둘째 줄', senderId: 'u2' },
    });
  });

  it('내가 보낸 메시지와 보고 있는 방의 메시지는 배지를 올리지 않는다', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chatRooms(null), pages([row('room1')]));
    applyMessageToRooms(client, msg(1, ME), { myId: ME, viewingRoomId: null });
    applyMessageToRooms(client, msg(2, 'u2'), { myId: ME, viewingRoomId: 'room1' });
    expect(roomsOf(client)[0]![0]!.unreadCount).toBe(0);
    // 늦게 온 예전 메시지는 미리보기를 되돌리지 않는다
    applyMessageToRooms(client, msg(1, 'u2', { content: '예전 것' }), { myId: ME, viewingRoomId: null });
    expect(roomsOf(client)[0]![0]).toMatchObject({ unreadCount: 0, lastMessage: { content: '메시지 2' } });
  });

  it('[AC-CL-16] 목록에 없는 방의 메시지면 false — 새로 생긴 방이다. 상품으로 거른 목록은 따지지 않는다', () => {
    const client = new QueryClient();
    // 목록 캐시가 없으면 고칠 것도 없다
    expect(applyMessageToRooms(client, msg(1, 'u2'), { myId: ME, viewingRoomId: null })).toBe(true);
    client.setQueryData(queryKeys.chatRooms('p9'), pages([row('other')]));
    expect(applyMessageToRooms(client, msg(1, 'u2'), { myId: ME, viewingRoomId: null })).toBe(true);
    client.setQueryData(queryKeys.chatRooms(null), pages([row('other')]));
    expect(applyMessageToRooms(client, msg(1, 'u2'), { myId: ME, viewingRoomId: null })).toBe(false);
  });

  it('[AC-CL-06, AC-CH-02] 내가 읽으면 그 행의 배지가 0, 상대가 읽은 위치는 뒤로 가지 않는다', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chatRooms(null), pages([row('room1', { unreadCount: 4 }), row('b', { unreadCount: 1 })]));
    markRoomRead(client, 'room1');
    expect(roomsOf(client)[0]!.map((item) => item.unreadCount)).toEqual([0, 1]);

    client.setQueryData(queryKeys.chatRoom('room1'), detail({ partnerLastReadSeq: 3 }));
    setPartnerRead(client, 'room1', 5);
    setPartnerRead(client, 'room1', 2);
    expect(client.getQueryData<ChatRoomResponse>(queryKeys.chatRoom('room1'))!.chatRoom.partnerLastReadSeq).toBe(5);
  });

  it('[AC-CH-41] 상품이 바뀌면 방의 요약과 목록 행을 고친다', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chatRooms(null), pages([row('room1'), row('b')]));
    client.setQueryData(queryKeys.chatRoom('room1'), detail());
    applyProduct(client, 'room1', { ...product, status: 'SOLD', deleted: true });
    expect(client.getQueryData<ChatRoomResponse>(queryKeys.chatRoom('room1'))!.chatRoom.product).toMatchObject({ status: 'SOLD', deleted: true });
    expect(roomsOf(client)[0]!.map((item) => item.product.deleted)).toEqual([true, false]);
  });

  it('[AC-CL-10] 같은 방이 두 번 실려 오면 먼저 온 것만 남긴다', () => {
    const list = uniqueRooms([
      { items: [row('a'), row('b')], nextCursor: 'c' },
      { items: [row('b', { unreadCount: 9 }), row('c')], nextCursor: null },
    ]);
    expect(list.map((item) => [item.id, item.unreadCount])).toEqual([['a', 0], ['b', 0], ['c', 0]]);
  });
});

// 서버 없이 화면을 그리는 가짜 연결. ack는 테스트가 골라서 준다
function fakeConnection() {
  const waiting: { event: string; payload: Record<string, unknown>; resolve: (value: unknown) => void }[] = [];
  const emitted: { event: string; payload: unknown }[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const fake: SocketLike = {
    connected: false,
    active: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, listener) => void listeners.set(event, listener as (...args: unknown[]) => void),
    emit: (event, payload) => void emitted.push({ event, payload }),
    timeout: () => ({
      emitWithAck: (event, payload) =>
        new Promise((resolve) => waiting.push({ event, payload: payload as Record<string, unknown>, resolve })),
    }),
  };
  const readFallback = vi.fn();
  const socket: ChatSocket = createChatSocket({
    createSocket: () => fake,
    fetchToken: () => Promise.resolve('token'),
    readFallback,
    handlers: {
      onMessage: vi.fn(),
      onDelivered: vi.fn(),
      onMissed: vi.fn(),
      onRoomRead: vi.fn(),
      onUnread: vi.fn(),
      onProductUpdated: vi.fn(),
      onReconnected: vi.fn(),
      onRoomDenied: vi.fn(),
    },
  });
  return {
    socket,
    waiting,
    emitted,
    readFallback,
    async open() {
      socket.connect();
      fake.connected = true;
      await act(async () => {
        listeners.get('connect')?.();
        await Promise.resolve();
      });
    },
    async drop() {
      fake.connected = false;
      await act(async () => listeners.get('disconnect')?.('transport close'));
    },
    async answer(event: string, result: unknown) {
      const index = waiting.findIndex((entry) => entry.event === event);
      const [entry] = waiting.splice(index, 1);
      await act(async () => {
        entry!.resolve(result);
        await Promise.resolve();
      });
      return entry!.payload;
    },
  };
}

function mount(ui: ReactNode, options: { client?: QueryClient; connection?: ReturnType<typeof fakeConnection>; user?: UserSelf | null } = {}) {
  const client = options.client ?? makeQueryClient();
  const connection = options.connection ?? fakeConnection();
  const setViewingRoom = vi.fn();
  render(
    <SessionProvider user={options.user === undefined ? me : options.user}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ChatSocketContext.Provider value={{ socket: connection.socket, setViewingRoom }}>
            {ui}
          </ChatSocketContext.Provider>
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>,
  );
  return { client, connection, setViewingRoom };
}

describe('채팅 목록', () => {
  it('[AC-CL-02, 03, 04, 08, AC-PX-07] 행에 상대 · 역할 · 마지막 메시지 · 읽지 않은 수 · 상품 상태가 보인다', async () => {
    handler = () => ({
      status: 200,
      body: {
        items: [
          row('r1', { unreadCount: 3, lastMessage: { content: '아직 있나요?', senderId: 'u2', createdAt: at(10, 15, 24) } }),
          row('r2', { myRole: 'SELLER', unreadCount: 120, product: { ...product, status: 'RESERVED' } }),
          row('r3', { product: { ...product, deleted: true } }),
        ],
        nextCursor: null,
      },
    });
    mount(<ChatList productId={null} />);
    const links = await screen.findAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/chats/r1', '/chats/r2', '/chats/r3']);
    expect(calls[0]!.url).toBe('/api/chat-rooms?limit=30');

    const first = within(links[0]!);
    expect(first.getByText('김당근')).toBeTruthy();
    expect(first.getByText('구매')).toBeTruthy();
    expect(first.getByText('아직 있나요?')).toBeTruthy();
    expect(first.getByText('읽지 않은 메시지 3개')).toBeTruthy();
    // 상품 제목은 화면에는 없어도 읽힌다
    expect(first.getByText('원목 의자')).toBeTruthy();

    const second = within(links[1]!);
    expect(second.getByText('판매')).toBeTruthy();
    expect(second.getByText('대화를 시작해 보세요')).toBeTruthy();
    expect(second.getByText('99+')).toBeTruthy();
    expect(second.getByText('예약중')).toBeTruthy();
    // 0이면 배지가 없다
    expect(within(links[2]!).queryByText(/읽지 않은/)).toBeNull();
    expect(within(links[2]!).getByText('삭제됨')).toBeTruthy();
  });

  it('[AC-CL-09] 방이 없으면 안내와 [물건 보러 가기]', async () => {
    handler = () => ({ status: 200, body: { items: [], nextCursor: null } });
    mount(<ChatList productId={null} />);
    expect(await screen.findByText('아직 채팅이 없어요')).toBeTruthy();
    expect(screen.getByRole('link', { name: '물건 보러 가기' }).getAttribute('href')).toBe('/');
  });

  it('[AC-CL-07, 10] 상품으로 거르면 요약과 [전체 보기]가 있고, [더 보기]에서 겹쳐 온 방은 한 번만 그린다', async () => {
    handler = (url) =>
      url.includes('cursor=')
        ? { status: 200, body: { items: [row('r2'), row('r3')], nextCursor: null } }
        : { status: 200, body: { items: [row('r1'), row('r2')], nextCursor: 'next' } };
    mount(<ChatList productId="p1" />);
    expect(await screen.findByText('원목 의자 · 15,000원')).toBeTruthy();
    expect(screen.getByRole('link', { name: '전체 보기' }).getAttribute('href')).toBe('/chats');
    expect(calls[0]!.url).toBe('/api/chat-rooms?limit=30&productId=p1');

    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull());
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs.filter((href) => href?.startsWith('/chats/'))).toEqual(['/chats/r1', '/chats/r2', '/chats/r3']);
  });

  it('[AC-CM-20, 21] 첫 조회가 실패하면 그 자리에 [다시 시도]', async () => {
    handler = () => ({ status: 500, body: { error: { code: 'INTERNAL', message: '일시적인 문제가 생겼어요', fields: null } } });
    mount(<ChatList productId={null} />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
  });
});

describe('탭 배지', () => {
  it('[AC-NT-01, 11] 읽지 않은 방의 수를 보이고 이름에 포함한다. 0이면 없다', async () => {
    handler = () => ({ status: 200, body: { rooms: 3 } });
    const { client } = mount(<UnreadBadge />);
    expect(await screen.findByText(', 읽지 않은 대화 3개')).toBeTruthy();
    expect(calls[0]!.url).toBe('/api/me/unread');
    // 소켓이 숫자를 바꾸면 따라간다
    act(() => void client.setQueryData(queryKeys.unread(), { rooms: 0 }));
    await waitFor(() => expect(screen.queryByText(/읽지 않은 대화/)).toBeNull());
  });

  it('비로그인이면 묻지 않는다', () => {
    mount(<UnreadBadge />, { user: null });
    expect(calls).toEqual([]);
  });
});

describe('메시지 입력', () => {
  const setup = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
    const onSend = vi.fn();
    mount(<Composer onSend={onSend} disabledReason={null} blocked={false} {...props} />);
    return { onSend, input: screen.getByLabelText('메시지 입력') as HTMLTextAreaElement, button: screen.getByRole('button', { name: '보내기' }) };
  };

  it('[AC-CH-12] Enter로 보내고 Shift+Enter는 줄바꿈, 보낸 뒤 입력창을 비운다', () => {
    const { onSend, input } = setup();
    fireEvent.change(input, { target: { value: '  안녕하세요\n\n\n\n반갑습니다  ' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    // 서버와 같은 함수로 다듬어 보낸다
    expect(onSend).toHaveBeenCalledWith('안녕하세요\n\n반갑습니다');
    expect(input.value).toBe('');
  });

  it('[CH-IN-07] 한글 조합 중의 Enter는 보내지 않는다', () => {
    const { onSend, input } = setup();
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('[AC-CH-12] 터치 환경에서는 Enter가 줄바꿈이고 버튼으로만 보낸다', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { onSend, input, button } = setup();
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onSend).toHaveBeenCalledWith('안녕');
  });

  it('[AC-CH-13] 빈 · 공백뿐인 메시지는 보낼 수 없다', () => {
    const { onSend, input, button } = setup();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(input, { target: { value: '  \n \n' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(button);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('[AC-CH-13, CH-IN-06] 900자부터 카운터가 보이고, 1,000자를 넘는 붙여넣기는 잘라 넣고 알린다', async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: '가'.repeat(899) } });
    expect(screen.queryByText('899/1000')).toBeNull();
    fireEvent.change(input, { target: { value: '가'.repeat(950) } });
    expect(screen.getByText('950/1000')).toBeTruthy();
    fireEvent.change(input, { target: { value: '👨‍👩‍👧'.repeat(5000) } });
    // 이모지 하나가 한 글자다
    expect(input.value).toBe('👨‍👩‍👧'.repeat(1000));
    expect(await screen.findByText('1,000자까지 보낼 수 있어요')).toBeTruthy();
  });

  it('[AC-CH-18, 33] 보낼 수 없는 이유가 있으면 입력창을 잠그고, 전송 한도에 걸리면 쓰던 글은 두고 버튼만 막는다', () => {
    const blocked = setup({ blocked: true });
    fireEvent.change(blocked.input, { target: { value: '쓰던 글' } });
    fireEvent.keyDown(blocked.input, { key: 'Enter' });
    expect(blocked.onSend).not.toHaveBeenCalled();
    expect(blocked.input.value).toBe('쓰던 글');
    expect(screen.getByText('잠시 후 보낼 수 있어요')).toBeTruthy();
  });

  it('[AC-CH-18] 삭제된 상품의 방은 입력창이 비활성이고 이유가 보인다', () => {
    const { input } = setup({ disabledReason: '삭제된 물건이라 메시지를 보낼 수 없어요' });
    expect(input.disabled).toBe(true);
    expect(screen.getByText('삭제된 물건이라 메시지를 보낼 수 없어요')).toBeTruthy();
  });
});

describe('채팅방', () => {
  function seeded(messages: Message[], room: Partial<ChatRoomDetail> = {}) {
    const client = makeQueryClient();
    client.setQueryData(queryKeys.chatRoom('room1'), detail(room));
    // 캐시는 최신이 앞
    client.setQueryData(queryKeys.messages('room1'), pages(messages.slice().sort((a, b) => b.seq - a.seq)));
    return client;
  }
  const bubbles = () => within(screen.getByRole('log')).getAllByRole('listitem').map((item) => item.textContent);

  it('[AC-CH-10, 15, 21] 오래된 것부터 그리고, 날짜가 바뀌면 구분선, 이어 보낸 메시지는 마지막에만 시각을 보인다', () => {
    const client = seeded([
      msg(1, 'u2', { createdAt: at(9, 23, 59), content: '어제 메시지' }),
      msg(2, ME, { createdAt: at(10, 15, 24), content: '하나' }),
      msg(3, ME, { createdAt: at(10, 15, 24), content: '둘' }),
      msg(4, 'u2', { createdAt: at(10, 15, 24), content: '답장' }),
    ]);
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client });

    expect(screen.getByRole('heading', { level: 1, name: '김당근' })).toBeTruthy();
    expect(screen.getAllByRole('separator').map((el) => el.textContent)).toEqual(['2026년 11월 9일 (월)', '2026년 11월 10일 (화)']);
    // 읽히는 순서: 보낸 사람, 내용, 시각
    expect(bubbles()).toEqual(['김당근,어제 메시지오후 11:59', '나,하나오후 3:24', '나,둘오후 3:24', '김당근,답장오후 3:24']);
    // 같은 분에 이어 보낸 "하나"의 시각은 화면에는 숨긴다
    const times = within(screen.getByRole('log')).getAllByText('오후 3:24');
    expect(times.map((el) => el.className.includes('sr-only'))).toEqual([true, false, false]);
    // 목록 자체는 읽어 주지 않는다 [AC-CH-42]
    expect(screen.getByRole('log').getAttribute('aria-live')).toBe('off');
  });

  it('[AC-CH-19] 메시지가 없으면 첫 메시지 안내가 보인다', () => {
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client: seeded([]) });
    expect(screen.getByText('김당근님에게 첫 메시지를 보내 보세요')).toBeTruthy();
  });

  it('[AC-CH-02] 상대가 내 마지막 메시지까지 읽었으면 그 아래 "읽음"이 한 번 보인다', async () => {
    const client = seeded([msg(1, ME), msg(2, ME), msg(3, 'u2')], { partnerLastReadSeq: 1 });
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client });
    expect(screen.queryByText('읽음')).toBeNull();
    act(() => setPartnerRead(client, 'room1', 2));
    await waitFor(() => expect(screen.getAllByText('읽음')).toHaveLength(1));
  });

  it('[AC-CH-01, 05] 들어오면 마지막 번호로 조인하고, 그린 마지막 번호를 읽음으로 보낸다', async () => {
    const connection = fakeConnection();
    await connection.open();
    const client = seeded([msg(1, 'u2'), msg(2, 'u2')]);
    const { setViewingRoom } = mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client, connection });

    expect(setViewingRoom).toHaveBeenCalledWith('room1');
    expect(await connection.answer('room:join', { ok: true, missed: [], hasMore: false })).toEqual({ roomId: 'room1', after: 2 });
    expect(connection.emitted).toEqual([{ event: 'room:read', payload: { roomId: 'room1', seq: 2 } }]);

    // 보는 동안 새 메시지가 오면 그 번호로 다시
    act(() => addMessages(client, 'room1', [msg(3, 'u2', { content: '새 메시지' })]));
    await waitFor(() =>
      expect(connection.emitted.at(-1)).toEqual({ event: 'room:read', payload: { roomId: 'room1', seq: 3 } }),
    );
    // 상대의 새 메시지만 알린다 [AC-CH-42]
    expect(screen.getByText('김당근: 새 메시지')).toBeTruthy();
  });

  it('[AC-CH-01] 소켓이 없으면 읽음을 HTTP로 보내고, 다시 붙으면 같은 번호를 소켓으로 한 번 더 보낸다', async () => {
    const connection = fakeConnection();
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client: seeded([msg(1, 'u2')]), connection });
    expect(connection.readFallback).toHaveBeenCalledWith('room1', 1);
    // 보이는 상태가 바뀌어도 같은 번호를 HTTP로 되풀이하지 않는다
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(connection.readFallback).toHaveBeenCalledTimes(1);

    // HTTP 시도가 실패했을 수 있다 — 연결되면 다시 보낸다
    await connection.open();
    await waitFor(() => expect(connection.emitted).toEqual([{ event: 'room:read', payload: { roomId: 'room1', seq: 1 } }]));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(connection.emitted).toHaveLength(1);
  });

  it('[AC-CH-03, 04] 보내면 바로 "전송 중" 말풍선이 생기고, 실패하면 글을 남긴 채 [재시도] · [삭제]를 보인다', async () => {
    const connection = fakeConnection();
    await connection.open();
    const client = seeded([msg(1, 'u2')]);
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client, connection });
    await connection.answer('room:join', { ok: true, missed: [], hasMore: false });

    const input = screen.getByLabelText('메시지 입력');
    fireEvent.change(input, { target: { value: '구매 원해요' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('구매 원해요')).toBeTruthy();
    expect(screen.getByText('전송 중')).toBeTruthy();

    const sent = await connection.answer('message:send', { ok: false, code: 'INTERNAL', retryAfterMs: null });
    expect(sent).toMatchObject({ roomId: 'room1', content: '구매 원해요' });
    expect(within(screen.getByRole('log')).getByRole('alert').textContent).toContain('메시지를 보내지 못했어요');
    expect(screen.getByText('구매 원해요')).toBeTruthy();

    // 재시도는 같은 tempId로
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    await waitFor(() => expect(connection.waiting.some((entry) => entry.event === 'message:send')).toBe(true));
    const retried = await connection.answer('message:send', { ok: false, code: 'INTERNAL', retryAfterMs: null });
    expect(retried.tempId).toBe(sent.tempId);

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.queryByText('구매 원해요')).toBeNull();
  });

  it('[AC-CH-38] 끊긴 동안 보낸 메시지는 "연결 중…"으로 남는다', async () => {
    const connection = fakeConnection();
    await connection.open();
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client: seeded([msg(1, 'u2')]), connection });
    await connection.answer('room:join', { ok: true, missed: [], hasMore: false });
    await connection.drop();
    const input = screen.getByLabelText('메시지 입력');
    fireEvent.change(input, { target: { value: '끊긴 동안' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('연결 중…')).toBeTruthy();
    expect(connection.waiting.filter((entry) => entry.event === 'message:send')).toEqual([]);
  });

  it('[AC-CH-17, 18, AC-PX-08] 삭제된 상품이면 요약 바가 링크가 아니고 입력창이 잠긴다. 살아 있으면 상세로 가는 링크다', async () => {
    const client = seeded([msg(1, 'u2')]);
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client });
    expect(screen.getByRole('link', { name: /원목 의자/ }).getAttribute('href')).toBe('/products/p1');

    // 보는 중에 삭제됐다 [AC-CH-41]
    act(() => applyProduct(client, 'room1', { ...product, deleted: true }));
    await waitFor(() => expect(screen.queryByRole('link', { name: /원목 의자/ })).toBeNull());
    expect(screen.getByText('삭제됨')).toBeTruthy();
    expect((screen.getByLabelText('메시지 입력') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText('삭제된 물건이라 메시지를 보낼 수 없어요')).toBeTruthy();
  });

  it('[AC-CH-11] 과거 메시지가 더 있으면 [이전 메시지 보기]로 이어 받는다', async () => {
    const client = makeQueryClient();
    client.setQueryData(queryKeys.chatRoom('room1'), detail());
    client.setQueryData(queryKeys.messages('room1'), {
      pages: [{ items: [msg(3, 'u2'), msg(2, 'u2')], nextCursor: 'older' }],
      pageParams: [null],
    });
    handler = () => ({ status: 200, body: { items: [msg(1, 'u2', { content: '가장 오래된' })], nextCursor: null } });
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client });
    fireEvent.click(screen.getByRole('button', { name: '이전 메시지 보기' }));
    expect(await screen.findByText('가장 오래된')).toBeTruthy();
    expect(calls.at(-1)!.url).toBe('/api/chat-rooms/room1/messages?limit=50&before=older');
    expect(screen.queryByRole('button', { name: '이전 메시지 보기' })).toBeNull();
    expect(bubbles()[0]).toContain('가장 오래된');
  });

  it('[AC-CH-22] 뒤로가기는 히스토리가 없으면 채팅 목록으로 간다', () => {
    mount(<ChatRoomScreen roomId="room1" myId={ME} />, { client: seeded([]) });
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(router.replace).toHaveBeenCalledWith('/chats');
  });
});

describe('[채팅하기]', () => {
  const button = (props: Partial<Parameters<typeof ChatButton>[0]> = {}) =>
    mount(<ChatButton productId="p1" loggedIn existingRoomId={null} sold={false} {...props} />);

  it('[AC-PD-13, 15] 방을 열고 그 방으로 간다. 누르는 동안 버튼이 잠긴다', async () => {
    handler = () => ({ status: 201, body: detail() });
    button();
    const el = screen.getByRole('button', { name: '채팅하기' });
    fireEvent.click(el);
    fireEvent.click(el);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/chats/room1'));
    expect(calls).toEqual([{ url: '/api/chat-rooms', method: 'POST', body: { productId: 'p1' } }]);
  });

  it('[AC-PD-12] 이미 대화한 방이 있으면 [채팅 이어하기] — 요청 없이 그 방으로', () => {
    button({ existingRoomId: 'room9', sold: true });
    fireEvent.click(screen.getByRole('button', { name: '채팅 이어하기' }));
    expect(router.push).toHaveBeenCalledWith('/chats/room9');
    expect(calls).toEqual([]);
  });

  it('[AC-PD-16] 비로그인이면 로그인으로 보내고 방을 만들지 않는다', () => {
    button({ loggedIn: false });
    fireEvent.click(screen.getByRole('button', { name: '채팅하기' }));
    expect(router.push).toHaveBeenCalledWith('/login?next=%2Fproducts%2Fp1');
    expect(calls).toEqual([]);
  });

  it('[AC-PD-18] 거래완료 상품은 눌러도 요청하지 않고 이유를 알린다', async () => {
    button({ sold: true });
    // 막힌 이유가 버튼 이름으로 보인다
    const el = screen.getByRole('button', { name: '거래완료' });
    expect(el.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(el);
    expect(calls).toEqual([]);
    expect((await screen.findByText('거래가 완료된 물건이에요')).closest('[role="status"]')).not.toBeNull();
  });

  it('[AC-PD-20] 그사이 거래완료되면 알리고 다시 그리고, 삭제됐으면 홈으로 보낸다', async () => {
    handler = () => ({ status: 409, body: { error: { code: 'PRODUCT_SOLD', message: '거래가 완료된 물건이에요', fields: null } } });
    button();
    fireEvent.click(screen.getByRole('button', { name: '채팅하기' }));
    expect(await screen.findByText('거래가 완료된 물건이에요')).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();

    handler = () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: '찾을 수 없어요', fields: null } } });
    fireEvent.click(screen.getByRole('button', { name: '채팅하기' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});

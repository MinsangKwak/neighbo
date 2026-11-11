import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, UserSelf } from '@neighbo/shared-schema';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { makeQueryClient } from '@/lib/query/QueryProvider';
import { queryKeys } from '@/lib/query/queryKeys';
import { sessionChange } from '@/features/auth/sessionChange';
import { lastSeq } from './cache';
import { ChatSocketProvider, useChatSocket } from './ChatSocketProvider';

// 진짜 프로바이더에 가짜 연결을 꽂는다 — 소켓 이벤트가 캐시에 어떻게 닿는지 본다
const wire = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  joins: [] as { payload: { roomId: string; after: number | null }; resolve: (value: unknown) => void }[],
  url: '',
}));
vi.mock('socket.io-client', () => ({
  io: (url: string, options: { auth: (callback: (data: unknown) => void) => void }) => {
    wire.url = url;
    options.auth(() => undefined);
    const fake = {
      connected: false,
      active: true,
      connect: () => undefined,
      disconnect: () => undefined,
      on: (event: string, listener: (...args: unknown[]) => void) => void wire.listeners.set(event, listener),
      emit: () => undefined,
      timeout: () => ({
        emitWithAck: (_event: string, payload: { roomId: string; after: number | null }) =>
          new Promise((resolve) => wire.joins.push({ payload, resolve })),
      }),
    };
    wire.listeners.set('__open', () => {
      fake.connected = true;
      wire.listeners.get('connect')?.();
    });
    wire.listeners.set('__kick', () => {
      fake.connected = false;
      wire.listeners.get('disconnect')?.('io server disconnect');
    });
    wire.listeners.set('__drop', () => {
      fake.connected = false;
      wire.listeners.get('disconnect')?.('transport close');
    });
    return fake;
  },
}));

const router = { push: vi.fn() };
let pathname = '/';
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => pathname }));

const me: UserSelf = { id: 'me', nickname: '나', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z', email: 'me@example.com', isDemo: false };
const msg = (roomId: string, seq: number, senderId = 'u2'): Message => ({
  id: `${roomId}-${seq}`,
  roomId,
  senderId,
  seq,
  content: `메시지 ${seq}`,
  tempId: `t${seq}`,
  createdAt: new Date(2026, 10, 10, 15, seq).toISOString(),
});
const cached = (roomId: string, ...seqs: number[]) => ({
  pages: [{ items: seqs.map((seq) => msg(roomId, seq)), nextCursor: null }],
  pageParams: [null],
});

// 채팅방 화면처럼 방 하나를 열어 둔다
function OpenRoom({ roomId }: { roomId: string }) {
  const { socket, setViewingRoom } = useChatSocket();
  useEffect(() => {
    setViewingRoom(roomId);
    socket.join(roomId, () => 5);
    return () => {
      setViewingRoom(null);
      socket.leave(roomId);
    };
  }, [roomId, setViewingRoom, socket]);
  return null;
}

const fire = (event: string, payload?: unknown) => act(async () => {
  wire.listeners.get(event)?.(payload);
  await Promise.resolve();
});

beforeEach(() => {
  router.push.mockClear();
  pathname = '/';
  window.history.replaceState(null, '', '/');
  document.title = '홈 · neighbo';
  wire.listeners.clear();
  wire.joins.length = 0;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ token: 't', expiresAt: '2026-11-11T00:00:00.000Z', rooms: 0 }))));
});
afterEach(() => vi.unstubAllGlobals());

function mount(user: UserSelf | null = me, socketUrl: string | null = 'http://localhost:4000') {
  const client = makeQueryClient();
  render(
    <SessionProvider user={user}>
      <QueryClientProvider client={client}>
        <ChatSocketProvider socketUrl={socketUrl}>
          <OpenRoom roomId="open" />
        </ChatSocketProvider>
      </QueryClientProvider>
    </SessionProvider>,
  );
  return client;
}

describe('ChatSocketProvider', () => {
  it('[AC-NT-10] 로그인 상태에서만, 주소가 있을 때만 연결한다', () => {
    mount(null);
    expect(wire.listeners.size).toBe(0);
    mount(me, null);
    expect(wire.listeners.size).toBe(0);
    mount();
    expect(wire.url).toBe('http://localhost:4000');
  });

  it('[AC-CH-05] 열려 있는 방은 메시지를 이어 붙이고, 번호가 건너뛰면 그 자리에서 다시 조인해 채운다', async () => {
    const client = mount();
    client.setQueryData(queryKeys.messages('open'), cached('open', 5));
    await fire('__open');
    expect(wire.joins.map((join) => join.payload)).toEqual([{ roomId: 'open', after: 5 }]);
    await act(async () => wire.joins.shift()!.resolve({ ok: true, missed: [], hasMore: false }));

    await fire('message:new', { message: msg('open', 6) });
    expect(lastSeq(client, 'open')).toBe(6);
    expect(wire.joins).toEqual([]);

    // 7번이 빠지고 8번이 왔다
    await fire('message:new', { message: msg('open', 8) });
    expect(wire.joins).toHaveLength(1);
    await act(async () => wire.joins.shift()!.resolve({ ok: true, missed: [msg('open', 7)], hasMore: false }));
    const seqs = client.getQueryData<ReturnType<typeof cached>>(queryKeys.messages('open'))!.pages[0]!.items.map((m) => m.seq);
    expect(seqs).toEqual([8, 7, 6, 5]);
  });

  it('닫힌 방의 메시지 캐시는 이어 붙이지 않고 버린다 — 틈을 메울 수 없는 캐시가 번호만 앞서가지 않게', async () => {
    const client = mount();
    client.setQueryData(queryKeys.messages('closed'), cached('closed', 5));
    await fire('__open');
    // 6번을 놓친 채 7번이 왔다. 이 방은 조인하지 않아 누락분을 물을 수 없다
    await fire('message:new', { message: msg('closed', 7) });
    expect(client.getQueryData(queryKeys.messages('closed'))).toBeUndefined();
    expect(wire.joins.map((join) => join.payload.roomId)).toEqual(['open']);
  });

  it('[AC-CL-11, AC-NT-13] 다시 붙으면 소켓으로만 갱신되던 캐시를 다시 받게 하고, 닫힌 방의 메시지 캐시는 버린다', async () => {
    const client = mount();
    client.setQueryData(queryKeys.messages('open'), cached('open', 5));
    client.setQueryData(queryKeys.messages('closed'), cached('closed', 5));
    client.setQueryData(queryKeys.unread(), { rooms: 1 });
    client.setQueryData(queryKeys.chatRooms(null), { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
    await fire('__open');
    await act(async () => wire.joins.shift()!.resolve({ ok: true, missed: [], hasMore: false }));
    const unreadFetches = () =>
      vi.mocked(fetch).mock.calls.filter((call) => String(call[0]) === '/api/me/unread').length;
    const before = unreadFetches();

    await fire('__drop');
    await fire('__open');
    await act(async () => wire.joins.shift()!.resolve({ ok: true, missed: [], hasMore: false }));
    // 배지는 화면에 떠 있어 곧바로 다시 받는다
    await waitFor(() => expect(unreadFetches()).toBe(before + 1));
    expect(client.getQueryState(queryKeys.chatRooms(null))?.isInvalidated).toBe(true);
    expect(client.getQueryData(queryKeys.messages('closed'))).toBeUndefined();
    // 열려 있는 방은 조인 응답의 누락분으로 이어 붙인다
    expect(lastSeq(client, 'open')).toBe(5);
  });

  it('[AC-CH-02, 40, AC-NT-01] 읽음은 누구의 것인지에 따라 다르게 반영하고, 배지 숫자를 바꾼다', async () => {
    const client = mount();
    const room = { id: 'open', product: {}, partner: {}, myRole: 'BUYER', partnerLastReadSeq: 0, createdAt: '' };
    client.setQueryData(queryKeys.chatRoom('open'), { chatRoom: room });
    client.setQueryData(queryKeys.chatRooms(null), {
      pages: [{ items: [{ id: 'open', unreadCount: 3 }], nextCursor: null }],
      pageParams: [null],
    });
    await fire('__open');

    // 상대가 읽었다 — "읽음"의 근거
    await fire('room:read', { roomId: 'open', userId: 'u2', lastReadSeq: 4 });
    expect(client.getQueryData<{ chatRoom: { partnerLastReadSeq: number } }>(queryKeys.chatRoom('open'))!.chatRoom.partnerLastReadSeq).toBe(4);
    const unreadOf = () =>
      client.getQueryData<{ pages: { items: { unreadCount: number }[] }[] }>(queryKeys.chatRooms(null))!.pages[0]!.items[0]!.unreadCount;
    expect(unreadOf()).toBe(3);

    // 내가 (다른 탭에서) 읽었다 — 그 행의 배지가 지워진다
    await fire('room:read', { roomId: 'open', userId: 'me', lastReadSeq: 4 });
    expect(unreadOf()).toBe(0);

    await fire('notification:unread', { total: 7, latest: null });
    expect(client.getQueryData(queryKeys.unread())).toEqual({ rooms: 7 });
  });

  const latest = (roomId: string, extra: Record<string, unknown> = {}) => ({
    total: 2,
    latest: {
      roomId,
      partner: { id: 'u2', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z' },
      preview: '아직 있나요?',
      count: 1,
      createdAt: '2026-11-10T06:00:00.000Z',
      ...extra,
    },
  });

  it('[AC-NT-05, 06] 다른 화면에서 새 메시지가 오면 토스트가 뜨고, 누르면 그 방으로 간다. 이어 오면 하나로 합친다', async () => {
    mount();
    await fire('__open');
    await fire('notification:unread', latest('room9'));
    const toast = screen.getByRole('button', { name: /김당근/ });
    expect(toast.textContent).toContain('아직 있나요?');
    // 포커스를 가져가지 않는다 [AC-NT-11]
    expect(document.activeElement).toBe(document.body);

    await fire('notification:unread', latest('room9', { count: 3 }));
    expect(screen.getAllByRole('button', { name: /김당근/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /김당근/ }).textContent).toContain('메시지 3개');

    fireEvent.click(screen.getByRole('button', { name: /김당근/ }));
    expect(router.push).toHaveBeenCalledWith('/chats/room9');
    expect(screen.queryByRole('button', { name: /김당근/ })).toBeNull();
  });

  it('[AC-NT-05, 14] 채팅 목록 · 그 방을 보는 중 · 탭이 숨겨진 동안에는 토스트 없이 배지만 바뀐다', async () => {
    const client = mount();
    await fire('__open');
    // 열려 있는 방(open)의 메시지
    await fire('notification:unread', latest('open'));
    expect(screen.queryByRole('button', { name: /김당근/ })).toBeNull();

    window.history.replaceState(null, '', '/chats');
    await fire('notification:unread', latest('room9'));
    expect(screen.queryByRole('button', { name: /김당근/ })).toBeNull();

    window.history.replaceState(null, '', '/');
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await fire('notification:unread', { ...latest('room9'), total: 5 });
    hidden.mockRestore();
    expect(screen.queryByRole('button', { name: /김당근/ })).toBeNull();
    expect(client.getQueryData(queryKeys.unread())).toEqual({ rooms: 5 });
  });

  it('[AC-NT-08] 읽지 않은 방이 있으면 탭 제목 앞에 수가 붙고, 없어지면 사라진다', async () => {
    const client = mount();
    await fire('__open');
    await fire('notification:unread', { total: 3, latest: null });
    await waitFor(() => expect(document.title).toBe('(3) 홈 · neighbo'));
    await fire('notification:unread', { total: 120, latest: null });
    await waitFor(() => expect(document.title).toBe('(99+) 홈 · neighbo'));
    act(() => void client.setQueryData(queryKeys.unread(), { rooms: 0 }));
    await waitFor(() => expect(document.title).toBe('홈 · neighbo'));
  });

  it('[AC-CH-31] 서버가 세션 만료를 알리고 끊으면 지금 화면으로 돌아오도록 로그인으로 보낸다', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/chats/room9', search: '?a=1', assign });
    mount();
    await fire('__open');
    await fire('error', { code: 'UNAUTHORIZED', message: '로그인이 필요해요' });
    await fire('__kick');
    expect(assign).toHaveBeenCalledWith('/login?next=%2Fchats%2Froom9%3Fa%3D1');
  });

  it('[AC-MP-09] 이 탭이 비밀번호를 바꾸는 중이면 연결이 끊겨도 로그인으로 보내지 않는다', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/me/password', search: '', assign });
    mount();
    await fire('__open');
    sessionChange.begin();
    await fire('error', { code: 'UNAUTHORIZED', message: '로그인이 필요해요' });
    await fire('__kick');
    sessionChange.end();
    expect(assign).not.toHaveBeenCalled();
  });
});

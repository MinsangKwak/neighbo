import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageToasts, shouldToast } from './messageToasts';

const latest = (roomId: string, count = 1, nickname = '김당근') => ({
  roomId,
  partner: { id: `u-${roomId}`, nickname, avatarUrl: null, createdAt: '2026-11-01T00:00:00.000Z' },
  preview: `${roomId}의 메시지`,
  count,
  createdAt: '2026-11-10T06:00:00.000Z',
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('새 메시지 토스트', () => {
  it('[AC-NT-05] 5초 뒤에 사라진다', () => {
    const toasts = createMessageToasts();
    toasts.push(latest('a'));
    expect(toasts.getSnapshot().map((toast) => toast.text)).toEqual(['a의 메시지']);
    vi.advanceTimersByTime(4999);
    expect(toasts.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.getSnapshot()).toEqual([]);
  });

  it('[AC-NT-06] 같은 방에서 이어 오면 하나로 합치고 시간을 다시 센다', () => {
    const toasts = createMessageToasts();
    toasts.push(latest('a'));
    vi.advanceTimersByTime(3000);
    toasts.push(latest('a', 2));
    expect(toasts.getSnapshot().map((toast) => toast.text)).toEqual(['메시지 2개']);
    vi.advanceTimersByTime(3000);
    expect(toasts.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(toasts.getSnapshot()).toEqual([]);
  });

  it('[AC-NT-06] 3개까지 쌓이고, 넘치면 가장 오래된 것이 밀려난다. 각자 제 시간에 사라진다', () => {
    const toasts = createMessageToasts();
    for (const room of ['a', 'b', 'c', 'd']) {
      toasts.push(latest(room));
      vi.advanceTimersByTime(1000);
    }
    expect(toasts.getSnapshot().map((toast) => toast.roomId)).toEqual(['b', 'c', 'd']);
    vi.advanceTimersByTime(2000);
    expect(toasts.getSnapshot().map((toast) => toast.roomId)).toEqual(['c', 'd']);
    toasts.dismiss('c');
    expect(toasts.getSnapshot().map((toast) => toast.roomId)).toEqual(['d']);
    toasts.clear();
    expect(toasts.getSnapshot()).toEqual([]);
  });

  it('[AC-NT-05, 14] 채팅 목록 · 그 방 · 숨겨진 탭에서는 띄우지 않는다', () => {
    const at = (pathname: string, viewingRoomId: string | null = null, visible = true) => ({ pathname, viewingRoomId, visible });
    expect(shouldToast('a', at('/'))).toBe(true);
    expect(shouldToast('a', at('/products/new'))).toBe(true);
    // 다른 방을 보는 중이면 띄운다
    expect(shouldToast('a', at('/chats/b', 'b'))).toBe(true);
    expect(shouldToast('a', at('/chats/a', 'a'))).toBe(false);
    expect(shouldToast('a', at('/chats'))).toBe(false);
    expect(shouldToast('a', at('/', null, false))).toBe(false);
  });
});

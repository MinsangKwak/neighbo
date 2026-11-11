import type { NotificationUnreadEvent } from '@neighbo/shared-schema';

type Latest = NonNullable<NotificationUnreadEvent['latest']>;

export interface MessageToast {
  roomId: string;
  nickname: string;
  avatarUrl: string | null;
  // 한 줄 미리보기. 여러 개가 이어 오면 "메시지 N개"
  text: string;
  // 이 시각(ms)에 사라진다
  expiresAt: number;
}

// 새 메시지 토스트는 5초 보이고, 한 번에 3개까지 [AC-NT-05, 06]
export const TOAST_VISIBLE_MS = 5000;
export const TOAST_MAX = 3;

// 토스트 목록 — 화면과 떨어뜨려 두어 규칙만 따로 확인할 수 있게 한다
export function createMessageToasts(now: () => number = Date.now) {
  let toasts: readonly MessageToast[] = [];
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function set(next: readonly MessageToast[]) {
    toasts = next;
    for (const listener of listeners) listener();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const soonest = Math.min(...next.map((toast) => toast.expiresAt));
    if (next.length > 0) {
      timer = setTimeout(() => set(toasts.filter((toast) => toast.expiresAt > now())), Math.max(0, soonest - now()));
    }
  }

  return {
    getSnapshot: () => toasts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // 같은 방의 토스트가 떠 있으면 새로 띄우지 않고 그 자리에서 합친다
    push(latest: Latest) {
      const toast: MessageToast = {
        roomId: latest.roomId,
        nickname: latest.partner.nickname,
        avatarUrl: latest.partner.avatarUrl,
        // 서버가 같은 방 5초 안의 메시지 수를 세어 준다 — 탭이 여러 개여도 같은 숫자를 본다
        text: latest.count > 1 ? `메시지 ${latest.count}개` : latest.preview,
        expiresAt: now() + TOAST_VISIBLE_MS,
      };
      const others = toasts.filter((item) => item.roomId !== latest.roomId);
      // 넘치면 가장 오래된 것부터 밀려난다
      set([...others, toast].slice(-TOAST_MAX));
    },
    dismiss(roomId: string) {
      set(toasts.filter((toast) => toast.roomId !== roomId));
    },
    // 로그아웃 · 화면 정리 [AC-NT-10]
    clear() {
      set([]);
    },
  };
}

export type MessageToasts = ReturnType<typeof createMessageToasts>;

// 토스트를 띄울 상황인가 — 채팅 목록과 그 방에서는 화면 자체가 알림이다 [AC-NT-05]
// 탭이 숨겨진 동안에는 띄우지 않고, 돌아왔을 때 몰아서 띄우지도 않는다 [AC-NT-14]
export function shouldToast(roomId: string, context: { pathname: string; viewingRoomId: string | null; visible: boolean }): boolean {
  if (!context.visible) return false;
  if (context.viewingRoomId === roomId) return false;
  return context.pathname !== '/chats';
}

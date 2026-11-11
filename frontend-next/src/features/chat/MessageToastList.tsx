'use client';

import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Avatar } from './Avatar';
import type { MessageToast, MessageToasts } from './messageToasts';

const EMPTY: readonly MessageToast[] = [];

// 새 메시지 토스트 — 위쪽 가운데에 뜨고 포커스를 가져가지 않는다. 누르면 그 방으로 [AC-NT-05, 11]
export function MessageToastList({ store }: { store: MessageToasts }) {
  const router = useRouter();
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);

  return (
    // 영역은 항상 둔다 — 나중에 생긴 영역의 첫 내용은 스크린리더가 읽지 않는다
    <div role="status" className="pointer-events-none fixed inset-x-0 top-2 z-50 mx-auto flex max-w-app flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.roomId}
          type="button"
          onClick={() => {
            store.dismiss(toast.roomId);
            router.push(`/chats/${toast.roomId}`);
          }}
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-text px-4 py-3 text-left text-bg shadow-lg"
        >
          <Avatar url={toast.avatarUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{toast.nickname}</span>
            <span className="block truncate text-sm">{toast.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

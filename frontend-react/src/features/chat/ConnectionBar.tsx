'use client';

import { useEffect, useState } from 'react';
import { useChatSocket, useSocketSnapshot } from './ChatSocketProvider';

// 짧은 끊김에 경고를 띄우면 깜빡임만 된다 — 5초 넘게 끊겼을 때만 [AC-CH-39]
const SHOW_AFTER_MS = 5000;

export function ConnectionBar() {
  const { socket } = useChatSocket();
  const { status, disconnectedAt } = useSocketSnapshot();
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    if (status !== 'reconnecting' || disconnectedAt === null) return;
    const timer = setTimeout(() => setOverdue(true), Math.max(0, disconnectedAt + SHOW_AFTER_MS - Date.now()));
    return () => {
      clearTimeout(timer);
      setOverdue(false);
    };
  }, [status, disconnectedAt]);

  // 영역은 항상 둔다 — 나중에 생긴 영역의 첫 내용은 스크린리더가 읽지 않는다
  return (
    <div role="status" className="empty:hidden bg-surface px-4 py-2 text-center text-sm">
      {status === 'reconnecting' && overdue && '실시간 연결이 끊겼어요. 다시 연결 중…'}
      {status === 'paused' && (
        <>
          이 탭의 실시간 연결이 꺼졌어요{' '}
          <button type="button" className="font-semibold underline" onClick={() => socket.connect()}>
            다시 연결
          </button>
        </>
      )}
    </div>
  );
}

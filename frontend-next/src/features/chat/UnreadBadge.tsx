'use client';

import { useQuery } from '@tanstack/react-query';
import { useSessionUser } from '@/features/auth/SessionProvider';
import { formatCount } from '@/lib/format';
import { queryKeys } from '@/lib/query/queryKeys';
import { fetchUnread } from './api';

// 읽지 않은 메시지가 있는 방의 수. 로그인 상태에서만 묻는다 [AC-NT-01]
export function useUnreadRooms(): number {
  const user = useSessionUser();
  const query = useQuery({
    queryKey: queryKeys.unread(),
    queryFn: fetchUnread,
    enabled: user !== null,
    // 소켓의 notification:unread가 갱신한다. 끊겼다 붙으면 프로바이더가 다시 받는다
    staleTime: Infinity,
  });
  return user === null ? 0 : (query.data?.rooms ?? 0);
}

// 탭의 [채팅] 옆 숫자 — 1~99, 99+, 0이면 없음
export function UnreadBadge() {
  const rooms = useUnreadRooms();
  const text = formatCount(rooms);
  if (text === null) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-badge px-1 text-xs font-semibold text-on-badge">
      <span aria-hidden="true">{text}</span>
      {/* 탭의 이름이 "채팅, 읽지 않은 대화 N개"로 읽힌다 [AC-NT-11] */}
      <span className="sr-only">, 읽지 않은 대화 {rooms}개</span>
    </span>
  );
}

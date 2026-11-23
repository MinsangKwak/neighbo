'use client';

import { useSyncExternalStore } from 'react';
import { formatFullTime, formatRelativeTime } from '@/lib/format';

const subscribe = () => () => undefined;

// 서버와 브라우저의 "지금"이 달라 처음부터 상대 시간을 그리면 하이드레이션이 어긋난다
// 서버에서는 날짜만, 브라우저에서 상대 시간으로 바꾼다. 전체 시각은 datetime · title에 둔다
export function RelativeTime({ iso }: { iso: string }) {
  const onClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} title={onClient ? formatFullTime(iso) : undefined} suppressHydrationWarning>
      {onClient ? formatRelativeTime(iso) : iso.slice(0, 10)}
    </time>
  );
}

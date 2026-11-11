'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { PRODUCT_STATUS_LABEL, type ChatRoomItem } from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { describeApiError } from '@/lib/api/ApiError';
import { formatChatTime, formatCount, formatFullTime, formatPrice } from '@/lib/format';
import { queryKeys } from '@/lib/query/queryKeys';
import { fetchChatRoomPage } from './api';
import { Avatar } from '@/components/Avatar';
import { uniqueRooms } from './cache';

const linkButton = 'inline-flex min-h-touch items-center rounded-lg bg-primary px-5 font-semibold text-on-primary';
const noop = () => () => undefined;

export function ChatList({ productId }: { productId: string | null }) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.chatRooms(productId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchChatRoomPage(productId, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    // 소켓 이벤트가 갱신한다. 다시 붙었을 때는 프로바이더가 무효화한다 [AC-CL-11]
    staleTime: Infinity,
  });
  // 시각은 브라우저의 "지금"으로 그린다 — 서버와 어긋나지 않게 하이드레이션 뒤에
  const onClient = useSyncExternalStore(noop, () => true, () => false);

  if (query.isPending) return <RowSkeleton />;
  if (query.data === undefined) {
    return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  }

  const rooms = uniqueRooms(query.data.pages);
  const filtered = productId === null ? null : (rooms[0]?.product ?? null);

  return (
    <>
      {productId !== null && (
        <div className="flex items-center justify-between gap-3 border-b border-divider bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            {filtered === null ? '이 물건의 채팅' : `${filtered.title} · ${formatPrice(filtered.price)}`}
          </p>
          <Link href="/chats" className="inline-flex min-h-touch items-center text-sm font-semibold underline">
            전체 보기
          </Link>
        </div>
      )}
      {rooms.length === 0 ? (
        <EmptyState
          title="아직 채팅이 없어요"
          description="마음에 드는 물건에 채팅을 걸어 보세요"
          action={
            <Link href="/" className={linkButton}>
              물건 보러 가기
            </Link>
          }
        />
      ) : (
        <ul>
          {rooms.map((room) => (
            // key가 방 id라 행이 위로 옮겨져도 포커스가 따라간다 [AC-CL-13]
            <li key={room.id} className="border-b border-divider">
              <RoomRow room={room} onClient={onClient} />
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <div className="flex flex-col items-center gap-2 px-4 py-4">
          {query.isFetchNextPageError && (
            <p role="alert" className="text-sm text-danger">
              불러오지 못했어요
            </p>
          )}
          <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchNextPageError ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
}

// 행 전체가 링크 하나다. 읽히는 순서: 상대 → 역할 → 상품 → 마지막 메시지 → 시각 → 읽지 않은 수 [CL-A11Y-01]
function RoomRow({ room, onClient }: { room: ChatRoomItem; onClient: boolean }) {
  const unread = formatCount(room.unreadCount);
  const at = room.lastMessage?.createdAt ?? room.lastActivityAt;
  const productState = room.product.deleted
    ? '삭제됨'
    : room.product.status === 'ON_SALE'
      ? null
      : PRODUCT_STATUS_LABEL[room.product.status];

  return (
    <Link href={`/chats/${room.id}`} className="flex min-h-18 items-center gap-3 px-4 py-3">
      <Avatar url={room.partner.avatarUrl} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold">{room.partner.nickname}</span>
          <span className="shrink-0 rounded bg-surface px-1 text-xs text-text-muted">
            {room.myRole === 'SELLER' ? '판매' : '구매'}
          </span>
        </span>
        <span className="sr-only">{room.product.title}</span>
        {room.lastMessage === null ? (
          <span className="truncate text-sm text-text-muted">대화를 시작해 보세요</span>
        ) : (
          <span className="truncate text-sm">{room.lastMessage.content}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <time dateTime={at} title={onClient ? formatFullTime(at) : undefined} className="text-xs text-text-muted" suppressHydrationWarning>
          {onClient ? formatChatTime(at) : at.slice(0, 10)}
        </time>
        {unread !== null && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-badge px-1 text-xs font-semibold text-on-badge">
            <span aria-hidden="true">{unread}</span>
            <span className="sr-only">읽지 않은 메시지 {room.unreadCount}개</span>
          </span>
        )}
      </span>
      {/* 상품 사진. 상태는 색이 아니라 글자로 알린다 [AC-CL-08] */}
      <span className="relative block size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
        {room.product.thumbnail !== null && (
          <Image
            src={room.product.thumbnail.url}
            alt=""
            width={room.product.thumbnail.width}
            height={room.product.thumbnail.height}
            unoptimized
            className={`size-full object-cover ${room.product.deleted ? 'opacity-60 grayscale' : ''}`}
          />
        )}
        {productState !== null && (
          <span className="absolute inset-x-0 bottom-0 bg-text text-center text-xs text-bg">{productState}</span>
        )}
      </span>
    </Link>
  );
}

function RowSkeleton() {
  return (
    <ul aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex min-h-18 animate-pulse items-center gap-3 border-b border-divider px-4 py-3">
          <span className="block size-10 rounded-full bg-surface" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="block h-4 w-24 rounded bg-surface" />
            <span className="block h-4 rounded bg-surface" />
          </span>
          <span className="block size-12 rounded-lg bg-surface" />
        </li>
      ))}
    </ul>
  );
}

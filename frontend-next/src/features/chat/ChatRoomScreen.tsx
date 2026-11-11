'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Message, ProductSummary } from '@neighbo/shared-schema';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { describeApiError } from '@/lib/api/ApiError';
import { formatClock, formatDateLine, formatPrice, isSameDay, isSameMinute } from '@/lib/format';
import { queryKeys } from '@/lib/query/queryKeys';
import type { PendingMessage } from '@/lib/socket/chatSocket';
import { fetchChatRoom, fetchMessagePage } from './api';
import { lastSeq } from './cache';
import { useChatSocket, useSocketSnapshot } from './ChatSocketProvider';
import { Composer } from './Composer';
import { ConnectionBar } from './ConnectionBar';

// 맨 아래에서 이만큼 안이면 "보고 있다"고 본다 [AC-CH-14]
const NEAR_BOTTOM_PX = 100;

const PENDING_LABEL = { sending: '전송 중', queued: '연결 중…', failed: '전송 실패' } as const;

// 채팅방 — 헤더 · 상품 요약 · 메시지 · 입력창. 탭바 없이 화면 높이를 다 쓴다 [AC-CH-10, 20]
export function ChatRoomScreen({ roomId, myId }: { roomId: string; myId: string }) {
  const client = useQueryClient();
  const { socket, setViewingRoom } = useChatSocket();
  const snapshot = useSocketSnapshot();

  // 서버가 그려 보낸 값으로 시작하고, 그 뒤는 소켓이 갱신한다
  const roomQuery = useQuery({
    queryKey: queryKeys.chatRoom(roomId),
    queryFn: () => fetchChatRoom(roomId),
    staleTime: Infinity,
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: queryKeys.messages(roomId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMessagePage(roomId, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: Infinity,
  });

  // 캐시는 최신이 앞 — 화면은 오래된 것부터 그린다
  const messages = useMemo(
    () => (messagesQuery.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse(),
    [messagesQuery.data],
  );
  const pending = snapshot.pending.filter((item) => item.roomId === roomId);
  const first = messages[0]?.seq ?? null;
  const last = messages.at(-1) ?? null;
  const loaded = messagesQuery.data !== undefined;

  // ── 조인 ───────────────────────────────────────────
  // 첫 화면의 마지막 번호를 after로 넘긴다 — 서버 렌더와 조인 사이에 온 메시지가 빠지지 않는다
  useEffect(() => {
    if (!loaded) return;
    setViewingRoom(roomId);
    socket.join(roomId, () => lastSeq(client, roomId));
    return () => {
      setViewingRoom(null);
      socket.leave(roomId);
    };
  }, [client, loaded, roomId, setViewingRoom, socket]);

  // ── 읽음 ───────────────────────────────────────────
  // 화면이 보이는 상태에서 실제로 그린 마지막 번호를 보낸다: 입장 · 보이는 동안 수신 · 돌아왔을 때 [AC-CH-01]
  const sentRead = useRef(0);
  const lastSeqValue = last?.seq ?? 0;
  const connected = snapshot.status === 'connected';
  useEffect(() => {
    const report = () => {
      if (document.visibilityState !== 'visible' || lastSeqValue <= sentRead.current) return;
      sentRead.current = lastSeqValue;
      socket.read(roomId, lastSeqValue);
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
    // 다시 붙었을 때도 한 번 더 본다 — 끊긴 동안의 읽음은 HTTP로 갔을 수 있다
  }, [connected, lastSeqValue, roomId, socket]);

  // ── 스크롤 ─────────────────────────────────────────
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const seen = useRef<{ first: number | null; last: number; pending: number; height: number } | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const toBottom = () => {
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
    setHasNew(false);
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null || !loaded) return;
    const before = seen.current;
    seen.current = { first, last: lastSeqValue, pending: pending.length, height: el.scrollHeight };
    if (before === null) {
      // 처음에는 맨 아래 [AC-CH-10]
      el.scrollTop = el.scrollHeight;
      return;
    }
    // 위에 과거 메시지가 붙었다 — 보던 자리가 움직이지 않게 늘어난 만큼 내린다 [AC-CH-11]
    if (first !== null && before.first !== null && first < before.first) {
      el.scrollTop += el.scrollHeight - before.height;
    }
    const sentMine = pending.length > before.pending;
    const arrived = lastSeqValue > before.last;
    if (!sentMine && !arrived) return;
    // 내가 보낸 것은 항상 맨 아래로. 받은 것은 아래를 보고 있을 때만 [AC-CH-14]
    if (sentMine || nearBottom.current || last?.senderId === myId) {
      el.scrollTop = el.scrollHeight;
      setHasNew(false);
    } else {
      setHasNew(true);
    }
    // 과거 메시지 로드 · 내 메시지는 읽지 않게, 상대의 새 메시지만 알린다 [AC-CH-42]
    if (arrived && last !== null && last.senderId !== myId) {
      setAnnouncement(`${roomQuery.data?.chatRoom.partner.nickname ?? '상대'}: ${last.content}`);
    }
    // 그려진 결과가 바뀔 때만 다시 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, lastSeqValue, pending.length, loaded]);

  // 위쪽 끝에 닿으면 과거 50개를 더 받는다. 버튼도 함께 둔다 [AC-CH-11]
  const topSentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messagesQuery;
  useEffect(() => {
    const target = topSentinel.current;
    if (target === null || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // 참여자가 아니게 됐거나 방이 없다
  if (roomQuery.data === undefined) {
    return (
      <>
        <AppHeader fallbackHref="/chats" />
        <main className="flex flex-1 flex-col">
          {roomQuery.isPending ? null : (
            <ErrorState message={describeApiError(roomQuery.error)} onRetry={() => void roomQuery.refetch()} />
          )}
        </main>
      </>
    );
  }

  const room = roomQuery.data.chatRoom;
  // 내 마지막 메시지를 상대가 읽었으면 그 아래 "읽음" 한 번 [AC-CH-02]
  const myLast = messages.findLast((message) => message.senderId === myId) ?? null;
  const readSeq = myLast !== null && room.partnerLastReadSeq >= myLast.seq ? myLast.seq : null;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader title={room.partner.nickname} fallbackHref="/chats" />
      <ConnectionBar />
      <ProductBar product={room.product} />
      <main
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
          if (nearBottom.current) setHasNew(false);
        }}
        className="relative flex-1 overflow-y-auto px-3 py-3"
      >
        {!loaded ? (
          messagesQuery.isPending ? (
            <BubbleSkeleton />
          ) : (
            <ErrorState message={describeApiError(messagesQuery.error)} onRetry={() => void messagesQuery.refetch()} />
          )
        ) : (
          <>
            <div ref={topSentinel} />
            {hasNextPage && (
              <div className="flex flex-col items-center gap-2 pb-3">
                {messagesQuery.isFetchNextPageError && (
                  <p role="alert" className="text-sm text-danger">
                    불러오지 못했어요
                  </p>
                )}
                <Button variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  {messagesQuery.isFetchNextPageError ? '다시 시도' : '이전 메시지 보기'}
                </Button>
              </div>
            )}
            {messages.length === 0 && pending.length === 0 && (
              <p className="py-16 text-center text-base text-text-muted">
                {room.partner.nickname}님에게 첫 메시지를 보내 보세요
              </p>
            )}
            {/* 목록 자체는 읽어 주지 않는다 — 과거 메시지 로드와 내 메시지까지 읽히지 않게 [AC-CH-42] */}
            <ol role="log" aria-live="off" aria-label="대화" className="flex flex-col gap-1">
              {messages.map((message, index) => (
                <Bubble
                  key={message.id}
                  message={message}
                  previous={messages[index - 1] ?? null}
                  next={messages[index + 1] ?? null}
                  mine={message.senderId === myId}
                  partnerName={room.partner.nickname}
                  read={readSeq === message.seq}
                />
              ))}
              {pending.map((item) => (
                <PendingBubble
                  key={item.tempId}
                  item={item}
                  onRetry={() => socket.retry(item.tempId)}
                  onRemove={() => socket.remove(item.tempId)}
                />
              ))}
            </ol>
          </>
        )}
        {hasNew && (
          <div className="sticky bottom-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                toBottom();
                // 마지막 메시지로 포커스를 옮긴다 [CH-A11Y-04]
                scroller.current?.querySelector<HTMLElement>('ol > li:last-child')?.focus();
              }}
              className="inline-flex min-h-touch items-center rounded-full bg-text px-4 text-sm font-semibold text-bg shadow-lg"
            >
              새 메시지 <span aria-hidden="true">↓</span>
            </button>
          </div>
        )}
      </main>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Composer
        onSend={(content) => socket.send(roomId, content)}
        disabledReason={
          room.product.deleted
            ? '삭제된 물건이라 메시지를 보낼 수 없어요'
            : !loaded
              ? '메시지를 불러온 뒤에 보낼 수 있어요'
              : null
        }
        blocked={snapshot.sendBlockedUntil !== null}
      />
    </div>
  );
}

// 상품 요약 바 — 누르면 상세로. 삭제된 상품은 갈 곳이 없어 링크가 아니다 [AC-CH-17]
function ProductBar({ product }: { product: ProductSummary }) {
  const body = (
    <>
      <span className="relative block size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
        {product.thumbnail !== null && (
          <Image
            src={product.thumbnail.url}
            alt=""
            width={product.thumbnail.width}
            height={product.thumbnail.height}
            unoptimized
            className={`size-full object-cover ${product.deleted ? 'opacity-60 grayscale' : ''}`}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{product.title}</span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {formatPrice(product.price)}
          <StatusBadge status={product.status} deleted={product.deleted} />
        </span>
      </span>
    </>
  );
  const className = 'flex items-center gap-3 border-b border-divider px-4 py-2';
  return product.deleted ? (
    <div className={className}>{body}</div>
  ) : (
    <Link href={`/products/${product.id}`} className={className}>
      {body}
    </Link>
  );
}

interface BubbleProps {
  message: Message;
  previous: Message | null;
  next: Message | null;
  mine: boolean;
  partnerName: string;
  read: boolean;
}

function Bubble({ message, previous, next, mine, partnerName, read }: BubbleProps) {
  const newDay = previous === null || !isSameDay(previous.createdAt, message.createdAt);
  // 같은 사람이 같은 분에 이어 보낸 메시지는 마지막에만 시각을 보인다 [AC-CH-15]
  const showTime =
    next === null || next.senderId !== message.senderId || !isSameMinute(next.createdAt, message.createdAt);
  const clock = formatClock(message.createdAt);

  return (
    <>
      {newDay && (
        <li role="separator" className="py-3 text-center text-xs text-text-muted">
          {formatDateLine(message.createdAt)}
        </li>
      )}
      {/* 읽히는 순서: 보낸 사람, 내용, 시각 [AC-CH-21] */}
      <li tabIndex={-1} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <span className={`flex max-w-3/4 items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <span className="sr-only">{mine ? '나' : partnerName},</span>
          {/* 줄바꿈은 보존하고 글자는 그대로 — 주소를 링크로 바꾸지 않는다 [AC-CH-16] */}
          <span
            className={`whitespace-pre-wrap break-all rounded-lg px-3 py-2 text-base ${
              mine ? 'bg-primary text-on-primary' : 'bg-surface text-text'
            }`}
          >
            {message.content}
          </span>
          <time dateTime={message.createdAt} className={showTime ? 'shrink-0 text-xs text-text-muted' : 'sr-only'} suppressHydrationWarning>
            {clock}
          </time>
        </span>
        {read && <span className="text-xs text-text-muted">읽음</span>}
      </li>
    </>
  );
}

function PendingBubble({ item, onRetry, onRemove }: { item: PendingMessage; onRetry(): void; onRemove(): void }) {
  const failed = item.status === 'failed';
  return (
    <li className="flex flex-col items-end gap-1">
      <span className="flex max-w-3/4 flex-row-reverse items-end gap-1">
        <span className="sr-only">나,</span>
        <span
          className={`whitespace-pre-wrap break-all rounded-lg bg-primary px-3 py-2 text-base text-on-primary ${
            failed ? '' : 'opacity-60'
          }`}
        >
          {item.content}
        </span>
        {!failed && <span className="shrink-0 text-xs text-text-muted">{PENDING_LABEL[item.status]}</span>}
      </span>
      {/* 쓴 글은 지우지 않는다. 다시 보내면 같은 전송으로 처리된다 [AC-CH-04] */}
      {failed && (
        <span className="flex items-center gap-2 text-sm">
          <span role="alert" className="text-danger">
            <span aria-hidden="true">! </span>
            {item.failure ?? '메시지를 보내지 못했어요'}
          </span>
          <button type="button" className="min-h-touch font-semibold underline" onClick={onRetry}>
            재시도
          </button>
          <button type="button" className="min-h-touch underline" onClick={onRemove}>
            삭제
          </button>
        </span>
      )}
    </li>
  );
}

// 말풍선 모양 5개, 좌우 번갈아 [CH-UI-06]
function BubbleSkeleton() {
  return (
    <ul aria-busy="true" aria-label="불러오는 중" className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className={`flex ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <span className="block h-10 w-40 rounded-lg bg-surface" />
        </li>
      ))}
    </ul>
  );
}

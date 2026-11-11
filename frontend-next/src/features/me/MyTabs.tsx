'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import type { MeCounts, MyProductCard, PurchaseCard } from '@neighbo/shared-schema';
import { Button, linkButtonClass } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { RelativeTime } from '@/components/RelativeTime';
import { TextSkeleton } from '@/components/Skeleton';
import { describeApiError } from '@/lib/api/ApiError';
import { formatPrice } from '@/lib/format';
import { queryKeys } from '@/lib/query/queryKeys';
import { fetchMyList, MY_TABS, type MyTab } from './api';

const LABEL: Record<MyTab, string> = { ON_SALE: '판매중', RESERVED: '예약중', SOLD: '거래완료', PURCHASED: '구매' };
// 탭마다 빈 상태 문구가 다르다 [AC-MP-05]
const EMPTY: Record<MyTab, string> = {
  ON_SALE: '판매 중인 물건이 없어요',
  RESERVED: '예약 중인 물건이 없어요',
  SOLD: '거래를 완료한 물건이 없어요',
  PURCHASED: '아직 구매한 물건이 없어요',
};

const countOf = (counts: MeCounts, tab: MyTab) =>
  ({ ON_SALE: counts.onSale, RESERVED: counts.reserved, SOLD: counts.sold, PURCHASED: counts.purchased })[tab];
// 999를 넘으면 999+ [MP-DT-05]
const shown = (count: number) => (count > 999 ? '999+' : String(count));

// 상태 탭 + 목록. 지금 탭은 주소(?status=)가 기억한다 [AC-MP-02]
export function MyTabs({ tab, counts }: { tab: MyTab; counts: MeCounts }) {
  const router = useRouter();
  const tabs = useRef(new Map<MyTab, HTMLButtonElement>());

  const select = (next: MyTab) => {
    // 기록을 쌓지 않는다 — 뒤로가기가 탭을 하나씩 되짚지 않게
    router.replace(next === 'ON_SALE' ? '/me' : `/me?status=${next}`, { scroll: false });
  };

  // 화살표로 옮기면 바로 그 탭이 열린다. 포커스는 탭에 남는다
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MY_TABS.indexOf(tab);
    const target =
      event.key === 'ArrowRight'
        ? MY_TABS[(index + 1) % MY_TABS.length]
        : event.key === 'ArrowLeft'
          ? MY_TABS[(index + MY_TABS.length - 1) % MY_TABS.length]
          : event.key === 'Home'
            ? MY_TABS[0]
            : event.key === 'End'
              ? MY_TABS.at(-1)
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    tabs.current.get(target)?.focus();
    select(target);
  };

  return (
    <>
      <div role="tablist" aria-label="내 거래" className="flex border-b border-divider">
        {MY_TABS.map((item) => {
          const selected = item === tab;
          const count = countOf(counts, item);
          return (
            <button
              key={item}
              ref={(element) => {
                if (element === null) tabs.current.delete(item);
                else tabs.current.set(item, element);
              }}
              type="button"
              role="tab"
              id={`my-tab-${item}`}
              aria-selected={selected}
              aria-controls="my-panel"
              // 선택된 탭만 Tab 순서에 든다. 나머지는 화살표로
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item)}
              onKeyDown={onKeyDown}
              className={`min-h-touch flex-1 border-b-2 px-1 py-2 text-sm ${
                selected ? 'border-primary font-semibold text-primary' : 'border-bg text-text-muted'
              }`}
            >
              {LABEL[item]} {shown(count)}
              <span className="sr-only">개</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="my-panel" aria-labelledby={`my-tab-${tab}`}>
        {/* 탭을 바꿨을 때 무엇이 열렸는지 알린다 */}
        <p role="status" className="sr-only">
          {LABEL[tab]} {countOf(counts, tab)}개
        </p>
        <MyList key={tab} tab={tab} />
      </div>
    </>
  );
}

function MyList({ tab }: { tab: MyTab }) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.myList(tab),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMyList(tab, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });

  if (query.isPending) return <TextSkeleton lines={4} />;
  // 프로필 카드와 탭은 그대로 두고 목록 자리만 바꾼다 [MP-NW-01]
  if (query.data === undefined) {
    return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  }
  const items = query.data.pages.flatMap((page) => page.items as (MyProductCard | PurchaseCard)[]);
  if (items.length === 0) {
    return (
      <EmptyState
        title={EMPTY[tab]}
        action={
          tab === 'ON_SALE' ? (
            <Link href="/products/new" className={linkButtonClass}>
              물건 올리기
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-divider">
            {'soldPrice' in item ? <PurchaseRow item={item} /> : <SellingRow item={item} />}
          </li>
        ))}
      </ul>
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

function Thumb({ image, faded = false }: { image: MyProductCard['thumbnail']; faded?: boolean }) {
  return (
    <span className="relative block size-16 shrink-0 overflow-hidden rounded-lg bg-surface">
      {image !== null && (
        <Image
          src={image.url}
          alt=""
          width={image.width}
          height={image.height}
          unoptimized
          className={`size-full object-cover ${faded ? 'opacity-60 grayscale' : ''}`}
        />
      )}
    </span>
  );
}

const rowClass = 'flex min-h-18 items-center gap-3 px-4 py-3';

function SellingRow({ item }: { item: MyProductCard }) {
  return (
    <Link href={`/products/${item.id}`} className={rowClass}>
      <Thumb image={item.thumbnail} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base">{item.title}</span>
        <span className="text-base font-semibold">{formatPrice(item.price)}</span>
        <span className="flex flex-wrap gap-2 text-sm text-text-muted">
          <RelativeTime iso={item.createdAt} />
          {item.chatRoomCount > 0 && <span>채팅 {item.chatRoomCount}</span>}
          {/* 거래완료 + 구매자를 정한 경우 [AC-MP-03] */}
          {item.buyer !== null && <span>{item.buyer.nickname}님과 거래</span>}
        </span>
      </span>
    </Link>
  );
}

// 삭제된 상품은 갈 곳이 없어 링크가 아니다 [AC-MP-04]
function PurchaseRow({ item }: { item: PurchaseCard }) {
  const body = (
    <>
      <Thumb image={item.thumbnail} faded={item.deleted} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base">
          {item.title}
          {item.deleted && <span className="ml-2 rounded bg-surface px-2 py-1 text-xs font-semibold text-text-muted">삭제됨</span>}
        </span>
        <span className="text-base font-semibold">{formatPrice(item.soldPrice)}</span>
        <span className="flex flex-wrap gap-2 text-sm text-text-muted">
          <span>{item.seller.nickname}님에게 구매</span>
          <RelativeTime iso={item.soldAt} />
        </span>
      </span>
    </>
  );
  return item.deleted ? (
    <div className={rowClass}>{body}</div>
  ) : (
    <Link href={`/products/${item.id}`} className={rowClass}>
      {body}
    </Link>
  );
}

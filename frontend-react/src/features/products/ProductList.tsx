'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { ProductCard } from '@/components/ProductCard';
import { CardSkeleton } from '@/components/Skeleton';
import { describeApiError } from '@/lib/api/ApiError';
import { queryKeys, type ProductListFilters } from '@/lib/query/queryKeys';
import { fetchProductPage } from './api';

interface ProductListProps {
  filters: ProductListFilters;
  // 결과가 없을 때 보여줄 것
  empty: ReactNode;
}

export function ProductList({ filters, empty }: ProductListProps) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.products(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchProductPage(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  if (query.isPending) return <CardSkeleton />;
  // 첫 페이지조차 없을 때만 영역 전체를 오류로 바꾼다 [AC-CM-21]
  if (query.data === undefined) {
    return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  }

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <>{empty}</>;

  const loadMore = async () => {
    const before = items.length;
    const result = await query.fetchNextPage();
    const after = result.data?.pages.flatMap((page) => page.items).length ?? before;
    if (result.isError || after === before) return;
    setAnnouncement(`${after - before}개 더 불러왔어요`);
    // 새로 붙은 첫 카드로 포커스를 옮긴다 [AC-PL-03]
    requestAnimationFrame(() => {
      listRef.current?.querySelectorAll<HTMLAnchorElement>('li > a')[before]?.focus();
    });
  };

  return (
    <>
      {/* 360px · 640px 모두 2열 [AC-PL-06] */}
      <ul ref={listRef} className="grid grid-cols-2 gap-4 p-4">
        {items.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} priority={index < 6} />
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {/* 다음이 없으면 버튼도 없다. 실패하면 기존 항목은 두고 버튼 자리에 알린다 [AC-PL-15] */}
      {query.hasNextPage && (
        <div className="flex flex-col items-center gap-2 px-4 pb-6">
          {query.isFetchNextPageError && (
            <p role="alert" className="text-sm text-danger">
              불러오지 못했어요
            </p>
          )}
          <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void loadMore()}>
            {query.isFetchNextPageError ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
}

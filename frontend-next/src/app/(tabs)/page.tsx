import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { linkButtonClass } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { getSessionUser } from '@/features/auth/session';
import { HideSoldToggle, ProductList, SearchForm } from '@/features/products';
import { prefetchProductList } from '@/features/products/server';

export const metadata: Metadata = { title: '홈' };


export default async function HomePage({ searchParams }: { searchParams: Promise<{ hideSold?: string }> }) {
  const filters = { q: null, hideSold: (await searchParams).hideSold === '1' };
  // 첫 20개는 서버에서 그려 보낸다 [AC-PL-01]
  const [user, state] = await Promise.all([getSessionUser(), prefetchProductList(filters)]);

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-divider px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-primary">neighbo</h1>
          {user === null && (
            <Link href="/login" className="inline-flex min-h-touch items-center px-2 text-sm font-semibold">
              로그인
            </Link>
          )}
        </div>
        <SearchForm />
      </header>
      <main className="flex-1">
        <HideSoldToggle checked={filters.hideSold} />
        <HydrationBoundary state={state}>
          <ProductList
            filters={filters}
            empty={
              <EmptyState
                title="아직 올라온 물건이 없어요"
                action={
                  user === null ? undefined : (
                    <Link href="/products/new" className={linkButtonClass}>
                      첫 물건 올리기
                    </Link>
                  )
                }
              />
            }
          />
        </HydrationBoundary>
        {/* 비로그인이면 보호 경로 검사가 로그인으로 보낸다 [AC-PL-07] */}
        {/* 화면이 아니라 앱 칸(최대 640px)의 오른쪽 아래에 붙인다 — fixed로 두면 넓은 화면에서 칸 밖 구석으로 나간다 */}
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 mx-auto flex max-w-app justify-end px-4">
          <Link
            href="/products/new"
            aria-label="물건 올리기"
            className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-on-primary shadow-lg"
          >
            <span aria-hidden="true">+</span>
          </Link>
        </div>
      </main>
    </>
  );
}

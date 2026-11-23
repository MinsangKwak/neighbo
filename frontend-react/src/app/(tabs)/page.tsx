import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { linkButtonClass } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { getSessionUser } from '@/features/auth/session';
import { HideSoldToggle, NearToggle, ProductList, SearchForm } from '@/features/products';
import { prefetchProductList } from '@/features/products/server';

export const metadata: Metadata = { title: '홈' };


export default async function HomePage({ searchParams }: { searchParams: Promise<{ hideSold?: string; near?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()]);
  // 동네는 주소가 아니라 로그인한 사람에게서 읽는다 — 동네가 없거나 로그인하지 않았으면 ?near=1 은 아무 일도 하지 않는다 [AC-NB-07]
  const neighborhood = user?.neighborhood ?? null;
  const near = params.near === '1' && neighborhood !== null;
  const filters = { q: null, hideSold: params.hideSold === '1', ...(near ? { neighborhood } : {}) };
  // 첫 20개는 서버에서 그려 보낸다 [AC-PL-01]
  const state = await prefetchProductList(filters);

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
        <div className="flex flex-wrap items-center gap-x-5 px-4">
          <HideSoldToggle checked={filters.hideSold} />
          {neighborhood !== null && <NearToggle checked={near} neighborhood={neighborhood} />}
          {/* 동네를 아직 정하지 않은 사람에게는 정하는 곳으로 가는 길을 둔다 [AC-NB-08] */}
          {user !== null && !user.isDemo && neighborhood === null && (
            <Link href="/me/edit" className="inline-flex min-h-touch items-center text-sm text-primary underline">
              내 동네 정하기
            </Link>
          )}
        </div>
        <HydrationBoundary state={state}>
          <ProductList
            filters={filters}
            empty={
              <EmptyState
                title={near ? `${neighborhood}에 올라온 물건이 없어요` : '아직 올라온 물건이 없어요'}
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

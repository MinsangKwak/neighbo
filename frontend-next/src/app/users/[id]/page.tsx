import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { getSessionUser } from '@/features/auth/session';
import { HideSoldToggle, ProductList } from '@/features/products';
import { prefetchProductList } from '@/features/products/server';
import { getUserProfile } from '@/features/users/server';
import { formatJoinedMonth } from '@/lib/format';

interface UserPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hideSold?: string }>;
}

// 메타데이터와 본문이 같은 조회 한 번을 나눠 쓴다
const loadProfile = cache(getUserProfile);

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const profile = await loadProfile((await params).id);
  return { title: profile === null ? '찾을 수 없어요' : `${profile.user.nickname}님의 프로필` };
}

// 판매자 정보 → 상태별 개수 → 올린 물건. 로그인 없이 본다 [AC-UP-01]
export default async function UserPage({ params, searchParams }: UserPageProps) {
  const { id } = await params;
  const profile = await loadProfile(id);
  if (profile === null) notFound();
  const filters = { q: null, hideSold: (await searchParams).hideSold === '1', sellerId: id };
  const [viewer, state] = await Promise.all([getSessionUser(), prefetchProductList(filters)]);
  const { user, counts } = profile;
  const total = counts.onSale + counts.reserved + counts.sold;

  return (
    <>
      <AppHeader title="프로필" />
      <main className="flex flex-1 flex-col">
        <section aria-label="판매자 정보" className="flex items-center gap-4 px-4 py-5">
          <Avatar url={user.avatarUrl} large />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{user.nickname}</h2>
            {/* 동네를 정한 사람만 보인다 [AC-NB-06] */}
            <p className="text-sm text-text-muted">
              {user.neighborhood !== null && `${user.neighborhood} · `}
              {formatJoinedMonth(user.createdAt)}
            </p>
          </div>
          {/* 내 프로필이면 고치는 곳으로 가는 길을 둔다 [AC-UP-07] */}
          {viewer?.id === user.id && (
            <Link
              href="/me"
              className="inline-flex min-h-touch shrink-0 items-center rounded-lg border border-border px-4 text-sm font-semibold whitespace-nowrap"
            >
              마이로 가기
            </Link>
          )}
        </section>
        <dl className="flex border-y border-divider text-center text-sm">
          {[
            ['판매중', counts.onSale],
            ['예약중', counts.reserved],
            ['거래완료', counts.sold],
          ].map(([label, count]) => (
            <div key={label} className="flex flex-1 flex-col-reverse py-3">
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-base font-semibold">{count}</dd>
            </div>
          ))}
        </dl>
        <h2 className="px-4 pt-5 text-base font-semibold">올린 물건</h2>
        {total > 0 && (
          <div className="px-4">
            <HideSoldToggle checked={filters.hideSold} />
          </div>
        )}
        <HydrationBoundary state={state}>
          <ProductList
            filters={filters}
            empty={<EmptyState title={filters.hideSold && total > 0 ? '거래 중인 물건이 없어요' : '올린 물건이 없어요'} />}
          />
        </HydrationBoundary>
      </main>
    </>
  );
}

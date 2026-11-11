import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ProductList } from '@/features/products';
import { prefetchProductList } from '@/features/products/server';

export const metadata: Metadata = { title: '관심 목록' };

const filters = { q: null, hideSold: false, favorites: true } as const;
const linkButton = 'inline-flex min-h-touch items-center rounded-lg bg-primary px-5 font-semibold text-on-primary';

// 관심을 누른 물건 — 누른 순서의 역순 [AC-FV-06]
export default async function FavoritesPage() {
  // 보호 화면의 2겹: 토큰이 실제로 유효한지는 서버가 판단한다 [AC-CM-01]
  if ((await getSessionUser()) === null) redirect(loginHref('/me/favorites'));
  const state = await prefetchProductList(filters);

  return (
    <>
      <AppHeader title="관심 목록" fallbackHref="/me" />
      <main className="flex-1">
        <HydrationBoundary state={state}>
          <ProductList
            filters={filters}
            empty={
              <EmptyState
                title="관심 목록이 비어 있어요"
                description="물건 화면의 ♡를 누르면 여기에 모여요"
                action={
                  <Link href="/" className={linkButton}>
                    물건 보러 가기
                  </Link>
                }
              />
            }
          />
        </HydrationBoundary>
      </main>
    </>
  );
}

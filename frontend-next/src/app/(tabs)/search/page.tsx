import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { countGraphemes, normalizeText, SEARCH_MIN } from '@neighbo/shared-schema';
import { EmptyState } from '@/components/EmptyState';
import { ProductList, SearchForm } from '@/features/products';
import { prefetchProductList } from '@/features/products/server';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const q = normalizeText((await searchParams).q ?? '');
  return { title: q === '' ? '검색' : `'${q}' 검색` };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const q = normalizeText((await searchParams).q ?? '');
  const valid = countGraphemes(q) >= SEARCH_MIN;
  const filters = { q, hideSold: false };
  const state = valid ? await prefetchProductList(filters) : null;

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-divider px-4 py-3">
        <h1 className="text-lg font-semibold">검색</h1>
        {/* 검색어가 바뀌면 입력칸도 새 값으로 다시 시작한다 */}
        <SearchForm key={q} initial={q} />
      </header>
      <main className="flex-1">
        {state === null ? (
          <EmptyState title="2자 이상 입력해 주세요" />
        ) : (
          <HydrationBoundary state={state}>
            <ProductList
              filters={filters}
              empty={
                <EmptyState
                  title={`'${q}'에 대한 검색 결과가 없어요`}
                  action={
                    <Link href="/search" className="font-semibold text-primary underline">
                      검색어 지우기
                    </Link>
                  }
                />
              }
            />
          </HydrationBoundary>
        )}
      </main>
    </>
  );
}

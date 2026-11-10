import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getSessionUser } from '@/features/auth/session';

export const metadata: Metadata = { title: '홈' };

// 상품 목록 조회는 상품 단계에서 붙인다
export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-divider px-4">
        <h1 className="text-lg font-semibold text-primary">neighbo</h1>
        {user === null ? (
          <Link href="/login" className="inline-flex min-h-touch items-center px-2 text-sm font-semibold">
            로그인
          </Link>
        ) : (
          <Link href="/me" className="inline-flex min-h-touch items-center px-2 text-sm font-semibold">
            {user.nickname}
          </Link>
        )}
      </header>
      <main className="flex-1">
        <EmptyState title="아직 올라온 물건이 없어요" />
      </main>
    </>
  );
}

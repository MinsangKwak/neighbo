import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm, safeNext } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { getDemoPassword } from '@/lib/config';

export const metadata: Metadata = { title: '로그인' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  // 이미 로그인했으면 홈으로 [AC-CM-05]
  if ((await getSessionUser()) !== null) redirect(next);

  return (
    <>
      <header className="flex h-14 items-center border-b border-divider px-4">
        <Link href="/" className="text-lg font-semibold text-primary">
          neighbo
        </Link>
      </header>
      <main className="flex-1 px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">로그인</h1>
        <LoginForm next={next} demoPassword={getDemoPassword()} />
      </main>
    </>
  );
}

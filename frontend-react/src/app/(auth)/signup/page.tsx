import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm, safeNext } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';

export const metadata: Metadata = { title: '회원가입' };

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
        <h1 className="mb-6 text-xl font-semibold">회원가입</h1>
        <SignupForm next={next} />
      </main>
    </>
  );
}

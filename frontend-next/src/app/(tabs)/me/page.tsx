import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton, loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';

export const metadata: Metadata = { title: '마이' };

// 인증 단계의 마이 — 내 정보와 로그아웃만. 판매 · 구매 내역은 마이 단계에서 붙인다
export default async function MePage() {
  // 보호 화면의 2겹: 토큰이 실제로 유효한지는 서버가 판단한다 [AC-CM-01]
  const user = await getSessionUser();
  if (user === null) redirect(loginHref('/me'));

  return (
    <>
      <header className="flex h-14 items-center border-b border-divider px-4">
        <h1 className="text-lg font-semibold">마이</h1>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-4 py-6">
        <section aria-label="내 정보">
          <p className="text-xl font-semibold">{user.nickname}</p>
          <p className="text-sm text-text-muted">{user.email}</p>
        </section>
        <Link href="/" className="text-sm font-semibold text-primary underline">
          홈으로
        </Link>
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </main>
    </>
  );
}

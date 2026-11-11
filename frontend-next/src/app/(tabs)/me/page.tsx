import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { LogoutButton, loginHref } from '@/features/auth';
import { MyTabs } from '@/features/me';
import { isMyTab } from '@/features/me/api';
import { getMe, prefetchMyList } from '@/features/me/server';
import { formatJoinedMonth } from '@/lib/format';

export const metadata: Metadata = { title: '마이' };

const linkClass =
  'inline-flex min-h-touch items-center rounded-lg border border-border px-3 text-sm font-semibold whitespace-nowrap';

// 프로필 카드 → [프로필 수정] → 탭 + 목록 → [로그아웃] [AC-MP-01]
export default async function MePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const raw = (await searchParams).status;
  const tab = isMyTab(raw) ? raw : 'ON_SALE';

  // 보호 화면의 2겹: 토큰이 실제로 유효한지는 서버가 판단한다 [AC-CM-01]
  const me = await getMe();
  if (me === null) redirect(loginHref(tab === 'ON_SALE' ? '/me' : `/me?status=${tab}`));
  const state = await prefetchMyList(tab);
  const { user, counts } = me;

  return (
    <>
      <header className="flex h-14 items-center border-b border-divider px-4">
        <h1 className="text-lg font-semibold">마이</h1>
      </header>
      <main className="flex flex-1 flex-col">
        <section aria-label="내 정보" className="flex items-center gap-4 px-4 py-5">
          <Avatar url={user.avatarUrl} large />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">{user.nickname}</p>
            <p className="truncate text-sm text-text-muted">{user.email}</p>
            <p className="text-sm text-text-muted">{formatJoinedMonth(user.createdAt)}</p>
          </div>
        </section>
        <div className="flex gap-2 px-4 pb-4">
          <Link href="/me/edit" className={linkClass}>
            프로필 수정
          </Link>
          <Link href="/me/password" className={linkClass}>
            비밀번호 변경
          </Link>
          <Link href="/me/favorites" className={linkClass}>
            관심 목록
          </Link>
        </div>
        <HydrationBoundary state={state}>
          <MyTabs tab={tab} counts={counts} />
        </HydrationBoundary>
        <div className="mt-auto px-4 py-6">
          <LogoutButton />
        </div>
      </main>
    </>
  );
}

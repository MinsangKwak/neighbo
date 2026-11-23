import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loginHref } from '@/features/auth';
import { PasswordForm } from '@/features/me';
import { getMe } from '@/features/me/server';

export const metadata: Metadata = { title: '비밀번호 변경' };

export default async function Page() {
  const me = await getMe();
  if (me === null) redirect(loginHref('/me/password'));
  return (
    <>
      <AppHeader title="비밀번호 변경" fallbackHref="/me" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <PasswordForm isDemo={me.user.isDemo} />
      </main>
    </>
  );
}

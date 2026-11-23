import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loginHref } from '@/features/auth';
import { ProfileForm } from '@/features/me';
import { getMe } from '@/features/me/server';

export const metadata: Metadata = { title: '프로필 수정' };

export default async function Page() {
  const me = await getMe();
  if (me === null) redirect(loginHref('/me/edit'));
  return (
    <>
      <AppHeader title="프로필 수정" fallbackHref="/me" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <ProfileForm user={me.user} />
      </main>
    </>
  );
}

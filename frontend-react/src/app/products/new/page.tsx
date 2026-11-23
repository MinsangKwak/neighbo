import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ProductForm } from '@/features/products';

export const metadata: Metadata = { title: '물건 올리기' };

export default async function NewProductPage() {
  // 보호 화면의 2겹 [AC-CM-01]
  if ((await getSessionUser()) === null) redirect(loginHref('/products/new'));
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <h1 className="px-4 pt-5 text-xl font-semibold">물건 올리기</h1>
        <ProductForm />
      </main>
    </>
  );
}

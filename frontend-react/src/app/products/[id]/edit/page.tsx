import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loginHref } from '@/features/auth';
import { getSessionUser } from '@/features/auth/session';
import { ProductForm } from '@/features/products';
import { getProduct } from '@/features/products/server';

export const metadata: Metadata = { title: '물건 수정' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await getSessionUser()) === null) redirect(loginHref(`/products/${id}/edit`));
  const data = await getProduct(id);
  // 남의 상품 · 삭제된 상품의 수정 주소는 404 화면이다 — 있는지조차 알려 주지 않는다
  if (data === null || data.viewer?.isSeller !== true) notFound();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <h1 className="px-4 pt-5 text-xl font-semibold">물건 수정</h1>
        <ProductForm product={data.product} />
      </main>
    </>
  );
}

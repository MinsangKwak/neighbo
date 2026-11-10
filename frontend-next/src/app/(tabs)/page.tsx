import type { Metadata } from 'next';
import { EmptyState } from '@/components/EmptyState';

export const metadata: Metadata = { title: '홈' };

// 뼈대 단계의 홈 — 상품 목록 조회는 상품 단계에서 붙인다
export default function HomePage() {
  return (
    <>
      <header className="flex h-14 items-center border-b border-divider px-4">
        <h1 className="text-lg font-semibold text-primary">neighbo</h1>
      </header>
      <main className="flex-1">
        <EmptyState title="아직 올라온 물건이 없어요" />
      </main>
    </>
  );
}

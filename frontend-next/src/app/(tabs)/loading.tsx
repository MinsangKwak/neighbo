import { CardSkeleton } from '@/components/Skeleton';

// 뼈대 화면도 화면이다 — 본문 구역과 제목이 있어야 보조 기술이 "불러오는 중"임을 안다
export default function Loading() {
  return (
    <>
      <div className="h-14 border-b border-divider" />
      <main aria-busy="true">
        <h1 className="sr-only">불러오는 중</h1>
        <CardSkeleton />
      </main>
    </>
  );
}

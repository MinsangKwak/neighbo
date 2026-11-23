import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  // 행동 버튼 · 링크. 없으면 그리지 않는다
  action?: ReactNode;
}

// 제목은 문단으로 둔다 — 화면의 제목 구조(h1 · h2)를 건너뛰지 않게
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-lg font-semibold text-text">{title}</p>
      {description !== undefined && <p className="text-base text-text-muted">{description}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

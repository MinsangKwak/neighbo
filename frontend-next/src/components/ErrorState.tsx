import { Button } from './Button';

// 영역 단위 오류 — 헤더 · 내비는 그대로 두고 본문 자리만 바꾼다 [AC-CM-21]
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-base">불러오지 못했어요</p>
      <p className="text-sm text-text-muted">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

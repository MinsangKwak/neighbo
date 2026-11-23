// 로딩 자리 표시 — 실제 레이아웃과 같은 자리를 차지한다 [AC-CM-20]
// 움직임 줄이기 설정이면 globals.css가 애니메이션을 멈춘다
export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="불러오는 중" className="grid grid-cols-2 gap-4 p-4">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex animate-pulse flex-col gap-2">
          <span className="block aspect-square rounded-lg bg-surface" />
          <span className="block h-4 rounded bg-surface" />
          <span className="block h-4 w-20 rounded bg-surface" />
        </li>
      ))}
    </ul>
  );
}

export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="flex animate-pulse flex-col gap-3 p-4">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="block h-4 rounded bg-surface" />
      ))}
    </div>
  );
}

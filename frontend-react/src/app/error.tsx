'use client';

// 페이지 단위 오류 화면 — 영역 단위 처리와 문의 번호 표시는 기능 단계에서 ErrorState로 옮긴다
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">일시적인 문제가 생겼어요</h1>
      <p className="text-text-muted">잠시 후 다시 시도해 주세요.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex min-h-touch items-center rounded-lg bg-primary px-5 font-semibold text-on-primary"
      >
        다시 시도
      </button>
    </main>
  );
}

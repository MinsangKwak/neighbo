'use client';

import { useToast } from '@/components/Toast';

// 기기의 공유 창을 쓰고, 없으면 주소를 복사한다 [AC-PD-21]
export function ShareButton({ title }: { title: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label="공유"
      onClick={() => {
        const url = window.location.href;
        if (typeof navigator.share === 'function') {
          navigator.share({ title, url }).catch(() => {
            // 사용자가 공유 창을 닫은 경우
          });
          return;
        }
        navigator.clipboard.writeText(url).then(
          () => toast('주소를 복사했어요'),
          () => toast('주소를 복사하지 못했어요', 'error'),
        );
      }}
      className="inline-flex min-h-touch items-center px-3 text-sm font-semibold"
    >
      공유
    </button>
  );
}

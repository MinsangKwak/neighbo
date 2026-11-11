'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';

// "거래완료 숨기기" — 상태는 URL(?hideSold=1)에 둔다. 기본은 꺼짐 [AC-PL-13]
export function HideSoldToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // 누르는 즉시 표시를 바꾼다 — 주소가 바뀌어 서버가 다시 그려 줄 때까지 기다리면 눌리지 않은 것처럼 보인다
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(checked);

  return (
    <label className="flex min-h-touch items-center gap-2 px-4 text-sm">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => {
          const on = event.target.checked;
          const next = new URLSearchParams(params.toString());
          if (on) next.set('hideSold', '1');
          else next.delete('hideSold');
          const query = next.toString();
          startTransition(() => {
            setShown(on);
            router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
          });
        }}
        className="size-5 accent-primary"
      />
      거래완료 숨기기
    </label>
  );
}

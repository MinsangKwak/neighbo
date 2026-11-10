'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// "거래완료 숨기기" — 상태는 URL(?hideSold=1)에 둔다. 기본은 꺼짐 [AC-PL-13]
export function HideSoldToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex min-h-touch items-center gap-2 px-4 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          if (event.target.checked) next.set('hideSold', '1');
          else next.delete('hideSold');
          const query = next.toString();
          router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
        }}
        className="size-5 accent-primary"
      />
      거래완료 숨기기
    </label>
  );
}

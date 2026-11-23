'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition, type ReactNode } from 'react';

interface QueryToggleProps {
  // 켜면 주소에 ?{param}=1 이 붙는다
  param: string;
  checked: boolean;
  children: ReactNode;
}

// 목록을 거르는 체크박스 — 상태는 URL에 둔다. 새로고침 · 공유 · 뒤로 가기에서 그대로 남는다 [AC-PL-13]
function QueryToggle({ param, checked, children }: QueryToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // 누르는 즉시 표시를 바꾼다 — 주소가 바뀌어 서버가 다시 그려 줄 때까지 기다리면 눌리지 않은 것처럼 보인다
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(checked);

  return (
    <label className="flex min-h-touch items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => {
          const on = event.target.checked;
          const next = new URLSearchParams(params.toString());
          if (on) next.set(param, '1');
          else next.delete(param);
          const query = next.toString();
          startTransition(() => {
            setShown(on);
            router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
          });
        }}
        className="size-5 accent-primary"
      />
      {children}
    </label>
  );
}

// "거래완료 숨기기" — ?hideSold=1. 기본은 꺼짐 [AC-PL-13]
export function HideSoldToggle({ checked }: { checked: boolean }) {
  return (
    <QueryToggle param="hideSold" checked={checked}>
      거래완료 숨기기
    </QueryToggle>
  );
}

// "내 동네만" — ?near=1. 어느 동네인지는 주소가 아니라 로그인한 사람에게서 읽는다 [AC-NB-07]
export function NearToggle({ checked, neighborhood }: { checked: boolean; neighborhood: string }) {
  return (
    <QueryToggle param="near" checked={checked}>
      <span>
        내 동네만 <span className="text-text-muted">({neighborhood})</span>
      </span>
    </QueryToggle>
  );
}

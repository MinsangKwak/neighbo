'use client';

import { useRef } from 'react';
import { clipGraphemes, countGraphemes } from '@neighbo/shared-schema';
import { useToast } from '@/components/Toast';

// 붙여넣은 값이 길이를 넘으면 잘라 넣고 알린다 [AC-CM-64]
// 손으로 친 글자는 자르지 않는다 — 친 글자를 말없이 지우지 않고 검증이 알린다 [AC-CM-61]
export function usePasteClip(max: number | undefined) {
  const toast = useToast();
  const pasted = useRef(false);

  return {
    onPaste: () => {
      pasted.current = true;
    },
    // onChange에서 받은 값을 넘긴다. 붙여넣기 직후의 값만 자른다
    clip(value: string): string {
      const wasPaste = pasted.current;
      pasted.current = false;
      if (max === undefined || !wasPaste || countGraphemes(value) <= max) return value;
      toast(`${max.toLocaleString('ko-KR')}자까지 입력할 수 있어요`);
      return clipGraphemes(value, max);
    },
  };
}

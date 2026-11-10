'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  // 되돌릴 수 없는 행동을 확인하는 창이면 alertdialog [AC-PX-02]
  alert?: boolean;
  children: ReactNode;
}

// 네이티브 <dialog>의 showModal() — 포커스 가두기 · Esc 닫기 · 닫힌 뒤 연 요소로 복귀를 브라우저가 해 준다 [AC-CM-42]
// 좁은 화면에서는 아래에 붙고(바텀시트), 넓으면 가운데에 뜬다 [AC-PX-13]
export function Dialog({ open, onClose, title, alert = false, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // 바깥(배경)을 누르면 닫는다
        if (event.target === ref.current) onClose();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-app rounded-t-lg bg-bg p-0 text-text backdrop:bg-text/50 sm:my-auto sm:max-w-sm sm:rounded-lg"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

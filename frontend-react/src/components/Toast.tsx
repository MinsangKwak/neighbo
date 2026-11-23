'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'error';

interface ToastState {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

const VISIBLE_MS = 4000;

// 포커스를 옮기지 않고 알린다. 정보는 role="status", 오류는 role="alert" [AC-CM-43]
// 호버 · 포커스 중에는 사라지지 않는다
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [held, setHeld] = useState(false);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: Tone = 'info') => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
  }, []);

  useEffect(() => {
    if (toast === null || held) return;
    const timer = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* 영역은 항상 있어야 스크린리더가 새 내용을 읽는다 */}
      {/* 화면 위쪽(헤더 바로 아래)에 띄운다 — 아래쪽에는 탭바 · 하단 고정 바 · 입력창 · 판매자 버튼이 있어 가린다 */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
        <div role="status" aria-live="polite">
          {toast?.tone === 'info' && (
            <ToastBody key={toast.id} toast={toast} onHold={setHeld} />
          )}
        </div>
        <div role="alert">
          {toast?.tone === 'error' && <ToastBody key={toast.id} toast={toast} onHold={setHeld} />}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastBody({ toast, onHold }: { toast: ToastState; onHold: (held: boolean) => void }) {
  return (
    <p
      tabIndex={-1}
      onMouseEnter={() => onHold(true)}
      onMouseLeave={() => onHold(false)}
      className="pointer-events-auto rounded-lg bg-text px-4 py-3 text-sm text-bg"
    >
      {toast.message}
    </p>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

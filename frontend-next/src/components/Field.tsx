'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

export type FieldKind = 'email' | 'newPassword' | 'currentPassword' | 'nickname' | 'text';

// 칸 종류마다 입력 속성 묶음 — 잘못 입력될 여지를 애초에 줄인다 [AC-CM-60, 65, AC-SU-06a, AC-LI-05c]
const KIND_ATTRIBUTES: Record<FieldKind, InputHTMLAttributes<HTMLInputElement>> = {
  email: {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 254,
  },
  newPassword: {
    type: 'password',
    autoComplete: 'new-password',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 64,
  },
  currentPassword: {
    type: 'password',
    autoComplete: 'current-password',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  // 글자 수는 grapheme으로 세므로 maxLength로 막지 않고 검증으로 알린다
  nickname: { type: 'text', autoComplete: 'nickname', autoCapitalize: 'off', spellCheck: false },
  text: { type: 'text' },
};

export interface FieldProps {
  kind: FieldKind;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  // 규칙 안내 — 오류 전부터 보인다 [AC-SU-12]
  hint?: string;
  error?: string | undefined;
  // 오류 아래에 덧붙는 행동 (예: [로그인하기])
  errorAction?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}

// 레이블 · 입력 · 안내 · 오류를 한 묶음으로 — aria 연결을 매번 손으로 잇지 않게
export function Field({ kind, name, label, value, onChange, onBlur, hint, error, errorAction, inputRef }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const isPassword = kind === 'newPassword' || kind === 'currentPassword';
  const hasError = error !== undefined && error !== '';

  const describedBy = [
    hint !== undefined ? `${id}-hint` : null,
    capsLock ? `${id}-caps` : null,
    hasError ? `${id}-error` : null,
  ]
    .filter((part) => part !== null)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          {...KIND_ATTRIBUTES[kind]}
          {...(isPassword && revealed ? { type: 'text' } : {})}
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          required
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            setCapsLock(false);
            onBlur?.();
          }}
          onKeyUp={(event) => {
            if (isPassword) setCapsLock(event.getModifierState('CapsLock'));
          }}
          className={`min-h-touch w-full rounded-lg border bg-bg px-3 text-base ${
            hasError ? 'border-danger' : 'border-border'
          } ${isPassword ? 'pr-16' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            aria-pressed={revealed}
            aria-label="비밀번호 보기"
            onClick={() => setRevealed((current) => !current)}
            className="absolute inset-y-0 right-0 min-w-touch px-3 text-sm text-text-muted"
          >
            {revealed ? '숨기기' : '보기'}
          </button>
        )}
      </div>
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {capsLock && (
        <p id={`${id}-caps`} className="text-sm text-text-muted">
          Caps Lock이 켜져 있어요
        </p>
      )}
      {hasError && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error} {errorAction}
        </p>
      )}
    </div>
  );
}

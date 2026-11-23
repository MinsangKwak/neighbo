import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-border bg-bg text-text',
  danger: 'bg-danger text-on-danger',
  ghost: 'text-text',
};

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  // 진행 중 — 스피너를 보이고 두 번 제출을 막는다
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

export const buttonClass = (variant: Variant, block: boolean) =>
  `inline-flex min-h-touch items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 text-base font-semibold ${
    VARIANTS[variant]
  } ${block ? 'w-full' : ''} aria-disabled:opacity-60`;

// 버튼처럼 보이는 링크(<Link>)에 쓴다 — 이동은 링크, 모양만 버튼 [AC-CM-47]
export const linkButtonClass = buttonClass('primary', false);

// 진행 중에도 disabled를 쓰지 않는다 — 포커스가 버튼에서 떨어져 나가지 않게 aria-disabled로 막는다
export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading || rest['aria-disabled'] === true) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={buttonClass(variant, block)}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

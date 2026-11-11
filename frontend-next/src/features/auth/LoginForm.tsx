'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginSchema, normalizeEmail, type AuthResponse } from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ApiError } from '@/lib/api/ApiError';
import { apiFetch } from '@/lib/api/apiFetch';
import { useForm } from '@/lib/form/useForm';
import { announceLogin } from './crossTab';

// 둘러보기용 계정 — 가입 없이 두 역할을 번갈아 써 본다 [AC-LI-19]
const DEMO_ACCOUNTS = [
  { email: 'demo@neighbo.app', role: '판매자' },
  { email: 'demo2@neighbo.app', role: '구매자' },
];

interface LoginFormProps {
  next: string;
  // 없으면 데모 안내를 숨긴다
  demoPassword: string | null;
}

export function LoginForm({ next, demoPassword }: LoginFormProps) {
  const router = useRouter();

  const form = useForm({
    initial: { email: '', password: '' },
    schema: loginSchema,
    normalize: { email: normalizeEmail },
    onSubmit: async (input) => {
      try {
        const { user } = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input });
        announceLogin(user.id);
        // 토스트 없이 이동. replace: 뒤로가기로 로그인 화면에 돌아오지 않게 [AC-LI-01, 09]
        router.replace(next);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
          // 비밀번호만 비우고 그 칸으로 포커스, 이메일은 유지 [AC-LI-07]
          form.setValue('password', '');
          form.focus('password');
        }
        // 끊겼을 때는 비밀번호를 유지한다 [AC-LI-16]
        throw err;
      }
    },
  });

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
      <div role="alert">
        {form.formError !== null && (
          <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">{form.formError}</p>
        )}
      </div>

      <Field kind="email" label="이메일" {...form.field('email')} />
      <Field kind="currentPassword" label="비밀번호" {...form.field('password')} />

      <Button type="submit" block loading={form.submitting}>
        로그인
      </Button>
      <p className="text-center text-sm">
        처음이신가요?{' '}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-primary underline">
          회원가입
        </Link>
      </p>

      {demoPassword !== null && (
        <section aria-labelledby="demo-heading" className="rounded-lg bg-surface p-4">
          <h2 id="demo-heading" className="text-sm font-semibold">
            가입 없이 둘러보기
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            여러 사람이 함께 쓰는 계정이에요. 개인정보를 적지 마세요. 매일 새벽에 초기화돼요
          </p>
          {/* 한 번 눌러 바로 들어간다 — 칸을 채운 뒤 [로그인]을 또 누르게 하지 않는다 */}
          <ul className="mt-3 flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <Button
                  variant="secondary"
                  block
                  loading={form.submitting}
                  onClick={() => {
                    form.submitWith({ email: account.email, password: demoPassword });
                  }}
                >
                  {account.role}로 둘러보기
                </Button>
                <p className="mt-1 text-xs text-text-muted">{account.email}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}

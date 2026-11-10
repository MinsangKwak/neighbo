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

export function LoginForm({ next }: { next: string }) {
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
    </form>
  );
}

'use client';

import { changePasswordSchema, normalizePassword } from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { leaveFlash } from '@/features/auth';
import { sessionChange } from '@/features/auth/sessionChange';
import { useForm } from '@/lib/form/useForm';
import { changePassword } from './api';

// 현재 · 새 · 확인 세 칸 [AC-MP-09]
export function PasswordForm({ isDemo }: { isDemo: boolean }) {
  const form = useForm({
    initial: { currentPassword: '', newPassword: '', newPasswordConfirm: '' },
    schema: changePasswordSchema,
    normalize: { newPassword: (value) => normalizePassword(value) },
    // 새 비밀번호를 고치면 확인 칸과 "현재와 같음" 판단도 다시 본다
    dependents: { newPassword: ['newPasswordConfirm'], currentPassword: ['newPassword'] },
    onSubmit: async (input) => {
      // 성공하면 서버가 이 탭의 실시간 연결도 끊는다. 그 신호를 세션 만료로 읽지 않게 한다
      sessionChange.begin();
      try {
        await changePassword(input);
      } catch (err) {
        sessionChange.end();
        throw err;
      }
      leaveFlash('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요');
      // 문서를 새로 받는다 — 이 탭의 실시간 연결도 옛 세션의 것이라 새 토큰으로 다시 붙어야 한다
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/me');
    },
  });

  if (isDemo) {
    return (
      <p className="rounded-lg bg-surface px-4 py-3 text-sm">
        둘러보기 계정은 여러 사람이 함께 써서 비밀번호를 바꿀 수 없어요
      </p>
    );
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
      <div role="alert">
        {form.formError !== null && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">{form.formError}</p>}
      </div>
      <Field kind="currentPassword" label="현재 비밀번호" {...form.field('currentPassword')} />
      <Field kind="newPassword" label="새 비밀번호" hint="8~64자" {...form.field('newPassword')} />
      <Field kind="newPassword" label="새 비밀번호 확인" {...form.field('newPasswordConfirm')} />
      <Button type="submit" block loading={form.submitting} aria-disabled={form.coolingDown || undefined}>
        비밀번호 바꾸기
      </Button>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import {
  NICKNAME_MAX,
  normalizeEmail,
  normalizeNickname,
  signupSchema,
  type AuthResponse,
  type AvailabilityResponse,
} from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/lib/api/ApiError';
import { apiFetch } from '@/lib/api/apiFetch';
import { useForm } from '@/lib/form/useForm';
import { announceLogin } from './crossTab';
import { loginHref } from './next';

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const toast = useToast();
  // 직전 제출이 끊겼는지 — 다시 보냈을 때의 409는 "이미 가입됐다"는 뜻이다
  const retried = useRef(false);

  const form = useForm({
    initial: { email: '', password: '', passwordConfirm: '', nickname: '' },
    schema: signupSchema,
    normalize: { email: normalizeEmail, nickname: normalizeNickname },
    dependents: { password: ['passwordConfirm'] },
    onSubmit: async (input) => {
      try {
        const { user } = await apiFetch<AuthResponse>('/auth/signup', { method: 'POST', body: input });
        // 다른 탭도 로그인 상태로 다시 그리게 한다
        announceLogin(user.id);
        toast(`환영해요, ${user.nickname}님`);
        // replace: 뒤로가기로 가입 화면에 돌아오지 않게 [AC-SU-22]
        router.replace(next);
        router.refresh();
      } catch (err) {
        // 제출 중 끊긴 뒤 다시 보냈는데 이미 만들어져 있던 경우 [AC-SU-21]
        if (err instanceof ApiError && err.code === 'EMAIL_TAKEN' && retried.current) {
          throw new ApiError(err.code, err.status, err.message, { email: '이미 가입됐어요. 로그인해 주세요' });
        }
        retried.current = err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT');
        throw err;
      }
    },
  });

  // 칸을 떠날 때 중복을 미리 알린다. 실패하면 조용히 넘어가고 제출 때 서버가 판단한다 [AC-SU-08, 16]
  const checkAvailability = async (name: 'email' | 'nickname') => {
    const { value, valid } = form.blur(name);
    if (!valid || value === '') return;
    try {
      const result = await apiFetch<AvailabilityResponse>(`/auth/${name}-available`, { query: { [name]: value } });
      if (!result.available && result.message !== null) form.setFieldError(name, result.message);
    } catch {
      // 참고용 확인이라 실패는 알리지 않는다
    }
  };

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
      {/* 상단 요약 — 틀린 칸이 몇 곳인지 한 번에 알린다 [AC-SU-17] */}
      <div role="alert">
        {form.errorCount > 0 && (
          <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">
            입력 내용 {form.errorCount}곳을 확인해 주세요
          </p>
        )}
        {form.formError !== null && (
          <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">{form.formError}</p>
        )}
      </div>

      <Field
        kind="email"
        label="이메일"
        hint="로그인할 때 쓰는 주소예요"
        {...form.field('email')}
        onBlur={() => void checkAvailability('email')}
        errorAction={
          form.errors.email?.startsWith('이미') === true ? (
            <Link href={loginHref(next)} className="font-semibold underline">
              로그인하기
            </Link>
          ) : undefined
        }
      />
      <Field
        kind="newPassword"
        label="비밀번호"
        hint="8자 이상. 문자 종류 제한은 없어요"
        {...form.field('password')}
      />
      <Field kind="newPassword" label="비밀번호 확인" {...form.field('passwordConfirm')} />
      <Field
        kind="nickname"
        maxGraphemes={NICKNAME_MAX}
        label="닉네임"
        hint="2~12자. 한글, 영문, 숫자, 공백, _ . - 를 쓸 수 있어요"
        {...form.field('nickname')}
        onBlur={() => void checkAvailability('nickname')}
      />

      <Button type="submit" block loading={form.submitting} aria-disabled={form.coolingDown || undefined}>
        가입하기
      </Button>
      {/* 약관 체크박스 대신 한 줄 안내 [AC-SU-19] */}
      <p className="text-center text-sm text-text-muted">가입하면 서비스 이용 안내에 동의한 것으로 봅니다.</p>
      <p className="text-center text-sm">
        이미 계정이 있나요?{' '}
        <Link href={loginHref(next)} className="font-semibold text-primary underline">
          로그인
        </Link>
      </p>
    </form>
  );
}

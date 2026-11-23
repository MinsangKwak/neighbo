'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { toFieldErrors } from '@neighbo/shared-schema';
import { ApiError, describeApiError } from '@/lib/api/ApiError';
import { useCooldown } from './useCooldown';

type Values = Record<string, string>;
type Errors<V extends Values> = Partial<Record<keyof V, string>>;

interface UseFormOptions<V extends Values, Output> {
  initial: V;
  // 공유 Zod 스키마 — 서버와 같은 규칙
  schema: z.ZodType<Output>;
  // 칸을 떠날 때 칸 안의 값을 고쳐 보여줄 함수 [AC-CM-62]
  normalize?: Partial<Record<keyof V, (value: string) => string>>;
  // 한 칸이 바뀌면 함께 다시 검증할 칸 (비밀번호 → 비밀번호 확인) [AC-SU-10]
  dependents?: Partial<Record<keyof V, (keyof V)[]>>;
  onSubmit: (output: Output) => Promise<void>;
}

// 폼 상태 훅 — 값 · 칸별 오류 · 제출 중
// 한 칸의 생애: 입력 중엔 막지 않음 → 칸을 떠날 때 정규화 · 검증 → 오류가 있던 칸은 입력마다 재검증 → 제출
export function useForm<V extends Values, Output>(options: UseFormOptions<V, Output>) {
  const { schema, normalize, dependents, onSubmit } = options;
  const [values, setValues] = useState<V>(options.initial);
  const [errors, setErrors] = useState<Errors<V>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef(new Map<keyof V, HTMLInputElement>());
  const submittingRef = useRef(false);
  // 요청이 너무 많다는 응답을 받으면 서버가 말한 시간만큼 제출을 잠근다 [AC-CM-26]
  const cooldown = useCooldown();

  const validate = useCallback(
    (candidate: V): Errors<V> => {
      const result = schema.safeParse(candidate);
      return result.success ? {} : (toFieldErrors(result.error) as Errors<V>);
    },
    [schema],
  );

  const focusFirst = (found: Errors<V>) => {
    const first = (Object.keys(options.initial) as (keyof V)[]).find((name) => found[name] !== undefined);
    if (first !== undefined) inputs.current.get(first)?.focus();
  };

  const setValue = (name: keyof V, value: string) => {
    const next = { ...values, [name]: value };
    setValues(next);
    // 오류가 보이던 칸만 입력마다 다시 검증한다 — 고친 순간 오류가 사라지게 [AC-SU-03]
    const watched = [name, ...(dependents?.[name] ?? [])].filter((key) => errors[key] !== undefined);
    if (watched.length > 0) {
      const found = validate(next);
      setErrors((current) => {
        const updated = { ...current };
        for (const key of watched) {
          if (found[key] === undefined) delete updated[key];
          else updated[key] = found[key];
        }
        return updated;
      });
    }
  };

  // 칸을 떠날 때: ① 정규화한 값을 칸에 다시 넣고 ② 그 칸을 검증한다
  const blur = (name: keyof V): { value: string; valid: boolean } => {
    const cleaned = normalize?.[name]?.(values[name] ?? '') ?? values[name] ?? '';
    const next = { ...values, [name]: cleaned };
    if (cleaned !== values[name]) setValues(next);
    const found = validate(next);
    const touched = [name, ...(dependents?.[name] ?? []).filter((key) => next[key] !== '')];
    setErrors((current) => {
      const updated = { ...current };
      for (const key of touched) {
        if (found[key] === undefined) delete updated[key];
        else updated[key] = found[key];
      }
      return updated;
    });
    return { value: cleaned, valid: found[name] === undefined };
  };

  const setFieldError = (name: keyof V, message: string) => {
    setErrors((current) => ({ ...current, [name]: message }));
  };

  const submitValues = async (current: V) => {
    // 두 번 제출 방지
    if (submittingRef.current || cooldown.active) return;
    setFormError(null);

    const result = schema.safeParse(current);
    if (!result.success) {
      // 전체 검증 → 틀린 칸 전부 표시 → 첫 오류로 포커스 [AC-SU-04, 17]
      const found = toFieldErrors(result.error) as Errors<V>;
      setErrors(found);
      focusFirst(found);
      return;
    }

    setErrors({});
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(result.data);
    } catch (err) {
      if (err instanceof ApiError && err.fields !== null) {
        // 서버가 최종 판단 — fields를 그대로 칸에 [AC-SU-18]
        const found = err.fields as Errors<V>;
        setErrors(found);
        focusFirst(found);
      } else {
        cooldown.startFrom(err);
        setFormError(describeApiError(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitValues(values);
  };

  // 칸을 채우고 곧바로 제출한다 (데모 계정으로 둘러보기). 칸에도 값이 보이게 해서 실패했을 때 무엇을 보냈는지 알 수 있다
  const submitWith = (partial: Partial<V>) => {
    const next = { ...values, ...partial };
    setValues(next);
    setErrors({});
    void submitValues(next);
  };

  const field = (name: keyof V & string) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (value: string) => setValue(name, value),
    onBlur: () => {
      blur(name);
    },
    inputRef: (element: HTMLInputElement | null) => {
      if (element === null) inputs.current.delete(name);
      else inputs.current.set(name, element);
    },
  });

  return {
    values,
    errors,
    errorCount: Object.keys(errors).length,
    formError,
    setFormError,
    submitting,
    // 잠시 제출할 수 없다 — 버튼에 aria-disabled로 건다
    coolingDown: cooldown.active,
    field,
    blur,
    setValue,
    submitWith,
    setFieldError,
    focus: (name: keyof V) => inputs.current.get(name)?.focus(),
    handleSubmit,
  };
}

import type { z } from 'zod';
import { toFieldErrors } from '@neighbo/shared-schema';
import { AppError } from '../errors/AppError.js';

// 공유 스키마로 검증하고 실패한 칸 전부를 fields에 담는다 [AC-CM-11]
// 검증은 "모양"만 본다 — DB를 봐야 아는 것(중복)은 서비스가 판단한다
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw new AppError('VALIDATION_FAILED', toFieldErrors(result.error));
  return result.data;
}

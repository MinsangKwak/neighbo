import { describe, expect, it } from 'vitest';
import { toFieldErrors } from './auth';
import { changePasswordSchema, myProductsQuerySchema, updateMeSchema } from './me';

const password = (input: Record<string, unknown>) => {
  const result = changePasswordSchema.safeParse({
    currentPassword: 'correct horse',
    newPassword: 'battery staple',
    newPasswordConfirm: 'battery staple',
    ...input,
  });
  return result.success ? {} : toFieldErrors(result.error);
};

describe('프로필 수정 스키마', () => {
  it('[AC-MP-12] 닉네임과 아바타만 받는다 — 다른 키는 버린다', () => {
    const parsed = updateMeSchema.parse({ nickname: '  새  닉네임 ', id: 'x', email: 'a@b.c', role: 'admin', isDemo: false });
    expect(parsed).toEqual({ nickname: '새 닉네임' });
    expect(updateMeSchema.parse({ avatarUploadId: null })).toEqual({ avatarUploadId: null });
    expect(updateMeSchema.parse({})).toEqual({});
  });

  it('[AC-MP-06] 닉네임은 가입과 같은 규칙으로 본다', () => {
    expect(updateMeSchema.safeParse({ nickname: '가' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ nickname: '관리자' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ nickname: 'Kim_01' }).success).toBe(true);
  });
});

describe('비밀번호 변경 스키마', () => {
  it('[AC-MP-09] 세 칸이 모두 맞으면 통과한다', () => {
    expect(password({})).toEqual({});
  });

  it('[AC-MP-09] 확인이 다르면 확인 칸에, 현재와 같으면 새 비밀번호 칸에 알린다', () => {
    expect(password({ newPasswordConfirm: 'battery stapl' })).toEqual({ newPasswordConfirm: '비밀번호가 일치하지 않아요' });
    expect(password({ newPassword: 'correct horse', newPasswordConfirm: 'correct horse' })).toEqual({
      newPassword: '지금 쓰는 비밀번호와 달라야 해요',
    });
  });

  it('새 비밀번호는 가입과 같은 길이 규칙, 현재 비밀번호는 비어 있지만 않으면 된다', () => {
    expect(password({ newPassword: 'short', newPasswordConfirm: 'short' }).newPassword).toBe('8자 이상 입력해 주세요');
    expect(password({ currentPassword: '   ' }).currentPassword).toBe('현재 비밀번호를 입력해 주세요');
    // 옛 규칙으로 만든 짧은 비밀번호도 현재 비밀번호로는 받는다
    expect(password({ currentPassword: 'old' })).toEqual({});
  });
});

describe('내 상품 쿼리', () => {
  it('[AC-MP-02] status가 없거나 모르는 값이면 거부한다', () => {
    expect(myProductsQuerySchema.safeParse({}).success).toBe(false);
    expect(myProductsQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
    expect(myProductsQuerySchema.parse({ status: 'SOLD', limit: '999' })).toEqual({ status: 'SOLD', limit: 50 });
  });
});

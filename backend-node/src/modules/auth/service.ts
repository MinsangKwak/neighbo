import { nicknameKey, type LoginInput, type SignupInput } from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { uniqueViolationIndex } from '../../db/errors.js';
import { AppError } from '../../errors/AppError.js';
import type { User } from '../../generated/prisma/client.js';
import { isCommonPassword, type PasswordHasher } from '../../lib/password.js';

export function createAuthService(db: Db, hasher: PasswordHasher) {
  return {
    // T1 — 단일 INSERT. 중복은 미리 조회하지 않고 유니크 제약에 맡긴다 [AC-SU-20]
    async signup(input: SignupInput): Promise<User> {
      if (isCommonPassword(input.password)) {
        throw new AppError('VALIDATION_FAILED', {
          password: '너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요',
        });
      }
      const passwordHash = await hasher.hash(input.password);
      try {
        return await db.user.create({
          data: {
            email: input.email,
            passwordHash,
            nickname: input.nickname,
            nicknameLower: nicknameKey(input.nickname),
          },
        });
      } catch (err) {
        // 어느 제약이 깨졌는지에 따라 뜻이 달라서 저장소가 아니라 서비스가 옮긴다
        const index = uniqueViolationIndex(err);
        if (index === 'User_email_key') {
          throw new AppError('EMAIL_TAKEN', { email: '이미 가입된 이메일이에요' });
        }
        if (index === 'User_nicknameLower_key') {
          throw new AppError('NICKNAME_TAKEN', { nickname: '이미 사용 중인 닉네임이에요' });
        }
        throw err;
      }
    },

    // 없는 이메일과 틀린 비밀번호는 같은 응답 · 같은 시간 [AC-LI-06]
    async login(input: LoginInput): Promise<User> {
      const found = await db.user.findUnique({ where: { email: input.email } });
      const user = found !== null && found.deletedAt === null ? found : null;
      const matched = await hasher.verify(input.password, user?.passwordHash ?? null);
      if (user === null || !matched) throw new AppError('INVALID_CREDENTIALS');
      return db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    },

    async isEmailAvailable(email: string): Promise<boolean> {
      return (await db.user.findUnique({ where: { email }, select: { id: true } })) === null;
    },

    async isNicknameAvailable(nickname: string): Promise<boolean> {
      const key = nicknameKey(nickname);
      return (await db.user.findUnique({ where: { nicknameLower: key }, select: { id: true } })) === null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

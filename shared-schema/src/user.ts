import { z } from 'zod';

// 다른 사람에게 보이는 사용자 — 이메일 없음 [AC-CM-14]
export const userPublicSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

// 본인에게만 [AC-CM-14]
export const userSelfSchema = userPublicSchema.extend({
  email: z.string(),
  // 둘러보기 계정 — 화면이 프로필 · 비밀번호 변경을 막고 이유를 적는다 [AC-LI-19]
  isDemo: z.boolean().default(false),
});
export type UserSelf = z.infer<typeof userSelfSchema>;

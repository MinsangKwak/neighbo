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
export const userSelfSchema = userPublicSchema.extend({ email: z.string() });
export type UserSelf = z.infer<typeof userSelfSchema>;

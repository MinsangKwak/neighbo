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

// GET /users/{id} — 누구나 보는 판매자 프로필. 구매 수는 본인만 본다 [AC-UP-01, 02]
export const userCountsSchema = z.object({
  onSale: z.number().int().min(0),
  reserved: z.number().int().min(0),
  sold: z.number().int().min(0),
});
export type UserCounts = z.infer<typeof userCountsSchema>;
export const userProfileResponseSchema = z.object({ user: userPublicSchema, counts: userCountsSchema });
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

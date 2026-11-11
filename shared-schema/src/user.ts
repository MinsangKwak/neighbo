import { z } from 'zod';

// 동네 — 목록에서 고른다. 위치 확인(GPS · 지도)은 하지 않는다 (docs/features/13-neighborhood.md)
// 이름이 곧 값이다. 순서는 가나다
export const NEIGHBORHOODS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구',
  '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
] as const;
export const neighborhoodSchema = z.enum(NEIGHBORHOODS, { error: '목록에 있는 동네를 골라 주세요' });
export type Neighborhood = z.infer<typeof neighborhoodSchema>;

// 다른 사람에게 보이는 사용자 — 이메일 없음 [AC-CM-14]
export const userPublicSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  // 정하지 않았으면 null. 옛 서버의 응답에는 없다 [AC-NB-01]
  neighborhood: z.string().nullable().default(null),
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

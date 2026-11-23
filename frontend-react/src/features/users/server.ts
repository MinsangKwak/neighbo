import 'server-only';
import { userProfileResponseSchema, type UserProfileResponse } from '@neighbo/shared-schema';
import { serverFetch } from '@/lib/api/serverFetch';

// 판매자 프로필 — 없는 사용자는 null (호출부가 notFound()) [AC-UP-06]
export async function getUserProfile(id: string): Promise<UserProfileResponse | null> {
  const response = await serverFetch(`/users/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`프로필 조회 실패 ${response.status}`);
  return userProfileResponseSchema.parse(await response.json());
}

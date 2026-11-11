import type { UserPublic, UserSelf } from '@neighbo/shared-schema';
import type { User } from '../../generated/prisma/client.js';

// 사용자 객체를 응답으로 옮기는 함수는 이 둘뿐이다 — 해시는 어디에도 나가지 않는다 [AC-CM-14]
export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    neighborhood: user.neighborhood,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toUserSelf(user: User): UserSelf {
  return { ...toUserPublic(user), email: user.email, isDemo: user.isDemo };
}

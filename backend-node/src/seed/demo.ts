import type { Db } from '../db/client.js';
import type { PasswordHasher } from '../lib/password.js';

// 데모 계정 — 고정 ID로 upsert해서 몇 번을 돌려도 같은 결과가 된다
// 근거: docs/architecture/backend.md 11절 4. 시드 데이터 [AC-LI-19]
export const DEMO_ACCOUNTS = [
  { id: 'demo_seller', email: 'demo@neighbo.app', nickname: '데모판매자' },
  { id: 'demo_buyer', email: 'demo2@neighbo.app', nickname: '데모구매자' },
] as const;

export async function seedDemoAccounts(db: Db, hasher: PasswordHasher, password: string): Promise<void> {
  for (const account of DEMO_ACCOUNTS) {
    const existing = await db.user.findUnique({ where: { id: account.id } });
    // 비밀번호가 그대로면 해시를 다시 만들지 않는다 — 배포할 때마다 행이 바뀌지 않게
    const passwordHash =
      existing !== null && (await hasher.verify(password, existing.passwordHash))
        ? existing.passwordHash
        : await hasher.hash(password);
    const data = {
      email: account.email,
      nickname: account.nickname,
      nicknameLower: account.nickname.toLowerCase(),
      passwordHash,
      isDemo: true,
      deletedAt: null,
    };
    // tokenVersion은 건드리지 않는다 — 시드가 접속 중인 사람을 로그아웃시키지 않게
    await db.user.upsert({ where: { id: account.id }, create: { id: account.id, ...data }, update: data });
  }
}

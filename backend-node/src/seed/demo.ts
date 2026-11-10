import { normalizePassword } from '@neighbo/shared-schema';
import type { Db } from '../db/client.js';
import type { PasswordHasher } from '../lib/password.js';

// 데모 계정 — 고정 ID로 upsert해서 몇 번을 돌려도 같은 결과가 된다
// 근거: docs/architecture/backend.md 11절 4. 시드 데이터 [AC-LI-19]
export const DEMO_ACCOUNTS = [
  { id: 'demo_seller', email: 'demo@neighbo.app', nickname: '데모판매자' },
  { id: 'demo_buyer', email: 'demo2@neighbo.app', nickname: '데모구매자' },
] as const;

export interface SeedReport {
  seeded: string[];
  // 같은 이메일 · 닉네임을 다른 계정이 이미 쓰고 있어 만들지 못한 데모 계정
  conflicts: string[];
}

export async function seedDemoAccounts(db: Db, hasher: PasswordHasher, rawPassword: string): Promise<SeedReport> {
  // 로그인이 비밀번호를 정규화(제로폭 제거 · NFC · 앞뒤 공백 제거)한 뒤 비교하므로 같은 값으로 해시한다
  const password = normalizePassword(rawPassword, { trim: true });
  const report: SeedReport = { seeded: [], conflicts: [] };

  for (const account of DEMO_ACCOUNTS) {
    const nicknameLower = account.nickname.toLowerCase();
    // 고정 ID가 없다고 이메일 · 닉네임이 비어 있는 것은 아니다 — 먼저 가입한 계정이 쓰고 있을 수 있다
    // 그 계정을 건드리지 않고 이 데모 계정만 건너뛴다. 배포를 멈추지 않는다
    const taken = await db.user.findFirst({
      where: { id: { not: account.id }, OR: [{ email: account.email }, { nicknameLower }] },
      select: { id: true },
    });
    if (taken !== null) {
      report.conflicts.push(account.email);
      continue;
    }

    const existing = await db.user.findUnique({ where: { id: account.id } });
    // 비밀번호가 그대로면 해시를 다시 만들지 않는다 — 배포할 때마다 행이 바뀌지 않게
    const passwordHash =
      existing !== null && (await hasher.verify(password, existing.passwordHash))
        ? existing.passwordHash
        : await hasher.hash(password);
    const data = {
      email: account.email,
      nickname: account.nickname,
      nicknameLower,
      passwordHash,
      isDemo: true,
      deletedAt: null,
    };
    // tokenVersion은 건드리지 않는다 — 시드가 접속 중인 사람을 로그아웃시키지 않게
    await db.user.upsert({ where: { id: account.id }, create: { id: account.id, ...data }, update: data });
    report.seeded.push(account.email);
  }
  return report;
}

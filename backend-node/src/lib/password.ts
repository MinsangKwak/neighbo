import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcrypt';

// 네이티브 bcrypt — 순수 JS 구현은 해시 동안 이벤트 루프를 막는다 (검토 요청 32)

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  // user가 없을 때도 같은 시간이 걸리게 더미 해시와 비교한다 [AC-LI-06]
  verify(password: string, hash: string | null): Promise<boolean>;
}

export async function createPasswordHasher(cost: number): Promise<PasswordHasher> {
  const dummyHash = await bcrypt.hash('dummy-password-for-timing', cost);
  return {
    hash: (password) => bcrypt.hash(password, cost),
    verify: async (password, hash) => {
      const matched = await bcrypt.compare(password, hash ?? dummyHash);
      return hash !== null && matched;
    },
  };
}

// 상위 1만 개 중 8자 이상 — 메모리 Set [AC-SU-09]
let commonPasswords: Set<string> | undefined;

export function isCommonPassword(password: string): boolean {
  commonPasswords ??= new Set(
    readFileSync(join(import.meta.dirname, '../data/common-passwords.txt'), 'utf8')
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#')),
  );
  return commonPasswords.has(password.toLowerCase());
}

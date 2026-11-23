import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './env.js';

// 테스트 DB에 마이그레이션을 적용한다 — 운영 배포와 같은 명령(migrate deploy)
export default function setup() {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    // eslint-disable-next-line no-restricted-properties
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

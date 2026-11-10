import type { Config } from '../src/config.js';
import { loadConfig } from '../src/config.js';

// 테스트는 .env.test가 아니라 이 코드가 값을 주입한다 — CI와 로컬이 같은 값으로 돈다
// DB 주소만 바깥에서 바꿀 수 있다 (CI의 서비스 컨테이너)
export const TEST_DATABASE_URL =
  // eslint-disable-next-line no-restricted-properties
  process.env.TEST_DATABASE_URL ?? 'postgresql://neighbo:neighbo@127.0.0.1:5432/neighbo_test';

export const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-jwt-secret-0123456789-0123456789',
  PROXY_SECRET: 'test-proxy-secret-0123456789-0123456789',
  ALLOWED_ORIGIN: 'http://localhost:3000',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '.data/test-uploads',
} satisfies Record<string, string>;

export function testConfig(overrides: Record<string, string | undefined> = {}): Config {
  return loadConfig({ ...baseEnv, ...overrides });
}

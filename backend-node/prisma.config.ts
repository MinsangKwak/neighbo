import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 CLI는 .env를 스스로 읽지 않는다. 개발 서버(tsx --env-file)와 같은 파일을 쓰게 한다
if (existsSync('.env')) process.loadEnvFile('.env');

// Prisma 7부터 연결 주소는 스키마가 아니라 이 파일에 둔다 (검토 요청 8)
// CLI 전용 파일이라 앱 설정(src/config.ts)을 거치지 않고 주소 하나만 읽는다
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // eslint-disable-next-line no-restricted-properties
  datasource: { url: process.env.DATABASE_URL ?? '' },
});

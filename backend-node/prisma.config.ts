import { defineConfig } from 'prisma/config';

// Prisma 7부터 연결 주소는 스키마가 아니라 이 파일에 둔다 (검토 요청 8)
// CLI 전용 파일이라 앱 설정(src/config.ts)을 거치지 않고 주소 하나만 읽는다
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // eslint-disable-next-line no-restricted-properties
  datasource: { url: process.env.DATABASE_URL ?? '' },
});

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// 커넥션 풀 10 — Railway 기본 플랜 한도 안 (backend.md 07절 5)
export function createDb(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: 10 });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;

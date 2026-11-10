import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

type WithWhere = { where?: Record<string, unknown> };

// 삭제된 상품을 걸러내는 조건을 붙인다. 호출부가 deletedAt을 직접 지정했으면 건드리지 않는다
function notDeleted<T extends WithWhere>(args: T): T {
  if (args.where !== undefined && 'deletedAt' in args.where) return args;
  return { ...args, where: { ...args.where, deletedAt: null } };
}

// 커넥션 풀 10 — Railway 기본 플랜 한도 안 (backend.md 07절 5)
export function createDb(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: 10 });
  const base = new PrismaClient({ adapter });

  // 모든 Product 조회 · 조건부 갱신에 deletedAt IS NULL을 자동으로 넣는다 [AC-PX-05]
  // 개별 쿼리가 조건을 잊어 삭제된 상품이 새어 나가는 일을 구조로 막는다
  const guarded = base.$extends({
    query: {
      product: {
        findMany: ({ args, query }) => query(notDeleted(args)),
        findFirst: ({ args, query }) => query(notDeleted(args)),
        findFirstOrThrow: ({ args, query }) => query(notDeleted(args)),
        findUnique: ({ args, query }) => query(notDeleted(args)),
        findUniqueOrThrow: ({ args, query }) => query(notDeleted(args)),
        count: ({ args, query }) => query(notDeleted(args)),
        updateMany: ({ args, query }) => query(notDeleted(args)),
      },
    },
  });

  return Object.assign(guarded, {
    // 삭제된 상품까지 봐야 하는 곳만 명시해서 쓴다 — 채팅의 상품 요약, 구매 내역, 실패 원인 구분
    withDeleted: () => base,
  });
}

export type Db = ReturnType<typeof createDb>;
// 트랜잭션 안에서 받는 클라이언트
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

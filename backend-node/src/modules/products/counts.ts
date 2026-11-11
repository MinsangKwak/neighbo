import type { UserCounts } from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';

// 한 사람이 올린 물건의 상태별 개수 — 마이의 탭과 판매자 프로필이 같은 숫자를 본다 [AC-MP-11, AC-UP-01]
// 삭제된 상품은 세지 않는다. 묶어 세는 조회에는 삭제 조건이 자동으로 붙지 않아 직접 적는다
export async function countSelling(db: Db, sellerId: string): Promise<UserCounts> {
  const rows = await db.product.groupBy({ by: ['status'], where: { sellerId, deletedAt: null }, _count: { _all: true } });
  const of = (status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;
  return { onSale: of('ON_SALE'), reserved: of('RESERVED'), sold: of('SOLD') };
}

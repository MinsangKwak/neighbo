import { Router } from 'express';
import type { UserProfileResponse } from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { AppError } from '../../errors/AppError.js';
import { toUserPublic } from '../auth/serialize.js';

// 판매자 프로필 — 로그인 없이 볼 수 있다. 이메일과 구매 수는 내보내지 않는다 [AC-UP-01, 02]
// 근거: docs/features/11-seller-profile.md
export function createUserRouter({ db }: { db: Db }): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const user = await db.user.findUnique({ where: { id } });
    if (user === null) throw new AppError('NOT_FOUND');
    // 삭제된 상품은 세지 않는다. 묶어 세는 조회에는 조건이 자동으로 붙지 않아 직접 적는다
    const rows = await db.product.groupBy({ by: ['status'], where: { sellerId: id, deletedAt: null }, _count: { _all: true } });
    const of = (status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;
    const body: UserProfileResponse = {
      user: toUserPublic(user),
      counts: { onSale: of('ON_SALE'), reserved: of('RESERVED'), sold: of('SOLD') },
    };
    res.json(body);
  });

  return router;
}

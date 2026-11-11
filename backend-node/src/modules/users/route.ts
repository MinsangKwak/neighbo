import { Router } from 'express';
import type { UserProfileResponse } from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { AppError } from '../../errors/AppError.js';
import { toUserPublic } from '../auth/serialize.js';
import { countSelling } from '../products/counts.js';

// 판매자 프로필 — 로그인 없이 볼 수 있다. 이메일과 구매 수는 내보내지 않는다 [AC-UP-01, 02]
// 근거: docs/features/11-seller-profile.md
export function createUserRouter({ db }: { db: Db }): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const user = await db.user.findUnique({ where: { id } });
    if (user === null) throw new AppError('NOT_FOUND');
    const body: UserProfileResponse = { user: toUserPublic(user), counts: await countSelling(db, id) };
    res.json(body);
  });

  return router;
}

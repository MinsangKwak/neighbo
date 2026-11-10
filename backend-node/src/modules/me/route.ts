import { Router } from 'express';
import type { AuthResponse } from '@neighbo/shared-schema';
import { currentUser, type Session } from '../../middleware/auth.js';
import { toUserSelf } from '../auth/serialize.js';

export function createMeRouter({ session }: { session: Session }): Router {
  const router = Router();

  // 서버 렌더가 로그인 상태를 알아내는 조회 [AC-LI-03]
  router.get('/', session.requireAuth, (_req, res) => {
    const body: AuthResponse = { user: toUserSelf(currentUser(res)) };
    res.json(body);
  });

  return router;
}

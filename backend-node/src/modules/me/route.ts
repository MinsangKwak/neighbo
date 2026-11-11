import { Router, type RequestHandler } from 'express';
import type { AuthResponse, UnreadResponse } from '@neighbo/shared-schema';
import { currentUser, type Session } from '../../middleware/auth.js';
import { toUserSelf } from '../auth/serialize.js';

interface MeRouteDeps {
  session: Session;
  // 읽지 않은 메시지가 있는 방의 수
  unreadRooms: (userId: string) => Promise<number>;
  // 사용자 분당 60 — 폴링 버그가 생겨도 서버가 버틴다 [AC-NT-12]
  unreadLimit: RequestHandler;
}

export function createMeRouter({ session, unreadRooms, unreadLimit }: MeRouteDeps): Router {
  const router = Router();

  // 서버 렌더가 로그인 상태를 알아내는 조회 [AC-LI-03]
  router.get('/', session.requireAuth, (_req, res) => {
    const body: AuthResponse = { user: toUserSelf(currentUser(res)) };
    res.json(body);
  });

  // 탭 배지 [AC-NT-01]
  router.get('/unread', session.requireAuth, unreadLimit, async (_req, res) => {
    const body: UnreadResponse = { rooms: await unreadRooms(currentUser(res).id) };
    res.json(body);
  });

  return router;
}

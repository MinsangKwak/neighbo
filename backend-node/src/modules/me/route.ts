import { Router, type RequestHandler } from 'express';
import {
  changePasswordSchema,
  favoritesQuerySchema,
  myProductsQuerySchema,
  purchasesQuerySchema,
  updateMeSchema,
  type AuthResponse,
  type MeResponse,
  type MyProductPage,
  type ProductPage,
  type PurchasePage,
  type UnreadResponse,
} from '@neighbo/shared-schema';
import { currentUser, type Session } from '../../middleware/auth.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { toUserPublic, toUserSelf } from '../auth/serialize.js';
import { toProductCard, toThumbnail } from '../products/serialize.js';
import type { MeService } from './service.js';

interface MeRouteDeps {
  service: MeService;
  session: Session;
  // 읽지 않은 메시지가 있는 방의 수
  unreadRooms: (userId: string) => Promise<number>;
  // 사용자 분당 60 — 폴링 버그가 생겨도 서버가 버틴다 [AC-NT-12]
  unreadLimit: RequestHandler;
  // 사용자 분당 30 — 엔드포인트마다 따로 센다 [AC-CM-32]
  writeLimit: (name: string) => RequestHandler;
}

// 경로에 사용자 id가 없다 — 항상 본인이다
export function createMeRouter({ service, session, unreadRooms, unreadLimit, writeLimit }: MeRouteDeps): Router {
  const router = Router();
  const auth = session.requireAuth;

  // 서버 렌더가 로그인 상태를 알아내는 조회 [AC-LI-03, AC-MP-11]
  router.get('/', auth, async (_req, res) => {
    const user = currentUser(res);
    const body: MeResponse = { user: toUserSelf(user), counts: await service.counts(user.id) };
    res.json(body);
  });

  router.patch('/', auth, writeLimit('me-update'), async (req, res) => {
    const user = await service.update(currentUser(res), parseOrThrow(updateMeSchema, req.body));
    const body: AuthResponse = { user: toUserSelf(user) };
    res.json(body);
  });

  // 성공하면 이 요청의 세션만 새 토큰으로 이어진다. 다른 기기는 다음 요청에서 401
  router.patch('/password', auth, writeLimit('me-password'), async (req, res) => {
    const user = await service.changePassword(currentUser(res), parseOrThrow(changePasswordSchema, req.body));
    session.setCookie(res, user);
    res.status(204).end();
  });

  router.get('/products', auth, async (req, res) => {
    const page = await service.products(currentUser(res).id, parseOrThrow(myProductsQuerySchema, req.query));
    const body: MyProductPage = {
      items: page.items.map((product) => ({
        ...toProductCard(product),
        buyer: product.buyer === null ? null : toUserPublic(product.buyer),
      })),
      nextCursor: page.nextCursor,
    };
    res.json(body);
  });

  router.get('/favorites', auth, async (req, res) => {
    const page = await service.favorites(currentUser(res).id, parseOrThrow(favoritesQuerySchema, req.query));
    const body: ProductPage = { items: page.items.map(toProductCard), nextCursor: page.nextCursor };
    res.json(body);
  });

  router.get('/purchases', auth, async (req, res) => {
    const page = await service.purchases(currentUser(res).id, parseOrThrow(purchasesQuerySchema, req.query));
    const body: PurchasePage = {
      items: page.items.map((product) => {
        const image = product.images[0];
        return {
          id: product.id,
          title: product.title,
          // 거래 시점의 가격. 옛 데이터에 없으면 지금 가격
          soldPrice: product.soldPrice ?? product.price,
          thumbnail: image === undefined ? null : toThumbnail(image),
          seller: toUserPublic(product.seller),
          soldAt: (product.soldAt ?? product.updatedAt).toISOString(),
          deleted: product.deletedAt !== null,
        };
      }),
      nextCursor: page.nextCursor,
    };
    res.json(body);
  });

  // 탭 배지 [AC-NT-01]
  router.get('/unread', auth, unreadLimit, async (_req, res) => {
    const body: UnreadResponse = { rooms: await unreadRooms(currentUser(res).id) };
    res.json(body);
  });

  return router;
}

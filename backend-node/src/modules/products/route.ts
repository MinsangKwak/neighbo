import { Router, type RequestHandler } from 'express';
import {
  changeStatusSchema,
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type ChatPartnersResponse,
  type ProductDetailResponse,
  type ProductPage,
  type ProductResponse,
} from '@neighbo/shared-schema';
import type { User } from '../../generated/prisma/client.js';
import { currentUser, type Session } from '../../middleware/auth.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { toUserPublic } from '../auth/serialize.js';
import { toProductCard, toProductDetail } from './serialize.js';
import type { ProductService } from './service.js';

interface ProductRouteDeps {
  service: ProductService;
  session: Session;
  // 사용자 분당 30 [AC-CM-32]
  writeLimit: RequestHandler;
}

export function createProductRouter({ service, session, writeLimit }: ProductRouteDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const page = await service.list(parseOrThrow(listProductsQuerySchema, req.query));
    const body: ProductPage = { items: page.items.map(toProductCard), nextCursor: page.nextCursor };
    res.json(body);
  });

  router.get('/:id', session.optionalAuth, async (req, res) => {
    const user = (res.locals.user as User | undefined) ?? null;
    const { product, viewer } = await service.detail(String(req.params.id), user);
    // viewer가 사람마다 달라 어디에도 캐시되면 안 된다
    res.setHeader('Cache-Control', 'no-store');
    const body: ProductDetailResponse = { product: toProductDetail(product), viewer };
    res.json(body);
  });

  router.post('/', session.requireAuth, writeLimit, async (req, res) => {
    const { product, created } = await service.create(currentUser(res), parseOrThrow(createProductSchema, req.body));
    const body: ProductResponse = { product: toProductDetail(product) };
    res.status(created ? 201 : 200).json(body);
  });

  router.patch('/:id', session.requireAuth, async (req, res) => {
    const product = await service.update(
      currentUser(res),
      String(req.params.id),
      parseOrThrow(updateProductSchema, req.body),
    );
    const body: ProductResponse = { product: toProductDetail(product) };
    res.json(body);
  });

  router.patch('/:id/status', session.requireAuth, async (req, res) => {
    const product = await service.changeStatus(
      currentUser(res),
      String(req.params.id),
      parseOrThrow(changeStatusSchema, req.body),
    );
    const body: ProductResponse = { product: toProductDetail(product) };
    res.json(body);
  });

  router.delete('/:id', session.requireAuth, async (req, res) => {
    await service.remove(currentUser(res), String(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/chat-partners', session.requireAuth, async (req, res) => {
    const partners = await service.chatPartners(currentUser(res), String(req.params.id));
    const body: ChatPartnersResponse = {
      items: partners.map((partner) => ({
        roomId: partner.roomId,
        user: toUserPublic(partner.user),
        lastActivityAt: partner.lastActivityAt.toISOString(),
      })),
    };
    res.json(body);
  });

  return router;
}

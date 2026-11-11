import {
  PRODUCT_STATUS_LABEL,
  STATUS_TRANSITIONS,
  type ChangeStatusInput,
  type CreateProductInput,
  type FavoriteResponse,
  type ListProductsQuery,
  type ProductStatus,
  type UpdateProductInput,
  type Viewer,
} from '@neighbo/shared-schema';
import { UPLOAD_TTL_MS } from '../uploads/ttl.js';
import type { Db, Tx } from '../../db/client.js';
import { uniqueViolationIndex } from '../../db/errors.js';
import { AppError } from '../../errors/AppError.js';
import type { Prisma, Upload, User } from '../../generated/prisma/client.js';
import { decodeCursor, takePage } from '../../lib/cursor.js';
import type { Realtime } from '../../realtime/Realtime.js';
import type { ImageStorage } from '../../storage/ImageStorage.js';
import { toProductSummary } from '../chat/serialize.js';
import type { DetailRow } from './serialize.js';


const cardInclude = {
  // 대표 사진만
  images: { orderBy: { order: 'asc' }, take: 1 },
  _count: { select: { chatRooms: true } },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  images: { orderBy: { order: 'asc' } },
  seller: true,
  _count: { select: { chatRooms: true, favorites: true } },
} satisfies Prisma.ProductInclude;

// ILIKE의 와일드카드를 글자 그대로 찾게 한다 [AC-PL-12]
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function createProductService(db: Db, storage: ImageStorage, realtime: Realtime) {
  // 상품이 바뀌면 그 상품의 방을 보고 있는 사람들에게 알린다 — 커밋 뒤에만 부른다 [AC-CH-41]
  // 알리지 못해도 요청은 성공이다. 화면은 다음 조회에서 맞춰진다
  async function notifyRooms(productId: string): Promise<void> {
    try {
      const product = await db.withDeleted().product.findUnique({
        where: { id: productId },
        include: { images: { orderBy: { order: 'asc' }, take: 1 }, chatRooms: { select: { id: true } } },
      });
      if (product === null || product.chatRooms.length === 0) return;
      realtime.productUpdated({ roomIds: product.chatRooms.map((room) => room.id), product: toProductSummary(product) });
    } catch {
      // 위 주석과 같다
    }
  }

  // 상품에 붙일 업로드를 확인하고 넘겨받는다 — 존재 · 만료 · 종류 · 소유자 [AC-PC-18]
  async function claimUploads(tx: Tx, userId: string, uploadIds: string[]): Promise<Upload[]> {
    if (uploadIds.length === 0) return [];
    const found = await tx.upload.findMany({ where: { id: { in: uploadIds } } });
    const byId = new Map(found.map((upload) => [upload.id, upload]));
    const expiredBefore = Date.now() - UPLOAD_TTL_MS;
    const uploads: Upload[] = [];
    for (const id of uploadIds) {
      const upload = byId.get(id);
      if (upload === undefined || upload.kind !== 'PRODUCT' || upload.createdAt.getTime() < expiredBefore) {
        throw new AppError('VALIDATION_FAILED', { imageIds: '사진을 다시 올려 주세요' });
      }
      if (upload.uploaderId !== userId) throw new AppError('FORBIDDEN');
      uploads.push(upload);
    }
    // 읽은 것만으로는 내 것이 아니다 — 같은 업로드를 붙이려는 다른 요청이 동시에 읽었을 수 있다
    // 임시 행을 지우는 데 성공한 요청만 파일을 넘겨받는다. 늦은 쪽은 0행을 지우고 여기서 멈춘다
    const { count } = await tx.upload.deleteMany({ where: { id: { in: uploadIds }, uploaderId: userId } });
    if (count !== uploadIds.length) throw new AppError('VALIDATION_FAILED', { imageIds: '사진을 다시 올려 주세요' });
    return uploads;
  }

  function imageRow(productId: string, upload: Upload, order: number) {
    return {
      productId,
      storageKey: upload.storageKey,
      url: upload.url,
      // 상품 사진 업로드는 항상 썸네일을 만든다
      thumbnailUrl: upload.thumbnailUrl ?? upload.url,
      width: upload.width,
      height: upload.height,
      order,
    };
  }

  async function findDetail(id: string): Promise<DetailRow> {
    const product = await db.product.findFirst({ where: { id }, include: detailInclude });
    // 없음 · 삭제됨은 판매자에게도 404 [AC-PD-19]
    if (product === null) throw new AppError('NOT_FOUND');
    return product;
  }

  // 조건부 갱신이 0행일 때만 다시 읽어 원인을 구분한다 — 성공 경로는 쿼리 하나
  async function explainMiss(id: string, userId: string): Promise<AppError> {
    const product = await db.withDeleted().product.findUnique({ where: { id } });
    if (product === null || product.deletedAt !== null) return new AppError('NOT_FOUND');
    if (product.sellerId !== userId) return new AppError('FORBIDDEN');
    // 있고 내 것인데 갱신되지 않았다 — 그사이 상태가 바뀌었다
    return new AppError('INVALID_TRANSITION');
  }

  return {
    // 목록 · 검색 [AC-PL-01~04, 12, 13, 16]
    async list(query: ListProductsQuery) {
      const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
      const where: Prisma.ProductWhereInput = {
        ...(query.hideSold ? { status: { not: 'SOLD' } } : {}),
        ...(query.sellerId === undefined ? {} : { sellerId: query.sellerId }),
        ...(query.q === undefined ? {} : { title: { contains: escapeLike(query.q), mode: 'insensitive' } }),
        // (createdAt, id)가 커서보다 뒤인 행 — 같은 시각이면 id로 가른다
        ...(cursor === null
          ? {}
          : { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }),
      };
      // 하나 더 읽어 다음 페이지가 있는지 안다
      const rows = await db.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: cardInclude,
      });
      return takePage(rows, query.limit, (last) => ({ at: last.createdAt, id: last.id }));
    },

    // 상세 + 보는 사람 기준 정보 [AC-PD-11, 12, 22]
    async detail(id: string, user: User | null): Promise<{ product: DetailRow; viewer: Viewer | null }> {
      const product = await findDetail(id);
      if (user === null) return { product, viewer: null };
      const isSeller = product.sellerId === user.id;
      // 자기 물건에는 채팅도 관심도 없다
      const [room, favorite] = isSeller
        ? [null, null]
        : await Promise.all([
            db.chatRoom.findUnique({
              where: { productId_buyerId: { productId: id, buyerId: user.id } },
              select: { id: true },
            }),
            db.favorite.findUnique({
              where: { userId_productId: { userId: user.id, productId: id } },
              select: { userId: true },
            }),
          ]);
      return { product, viewer: { isSeller, existingChatRoomId: room?.id ?? null, isFavorite: favorite !== null } };
    },

    // 관심을 켠다 — 몇 번을 눌러도 한 줄이다. 삭제된 물건과 자기 물건에는 켤 수 없다 [AC-FV-01, 03, 04]
    async favorite(user: User, id: string): Promise<FavoriteResponse> {
      const product = await db.product.findFirst({ where: { id }, select: { sellerId: true } });
      if (product === null) throw new AppError('NOT_FOUND');
      if (product.sellerId === user.id) throw new AppError('FORBIDDEN');
      await db.favorite.createMany({ data: [{ userId: user.id, productId: id }], skipDuplicates: true });
      return { isFavorite: true, favoriteCount: await db.favorite.count({ where: { productId: id } }) };
    },

    // 관심을 끈다 — 없던 것을 꺼도, 물건이 그 사이 삭제됐어도 성공이다 [AC-FV-02]
    async unfavorite(user: User, id: string): Promise<FavoriteResponse> {
      await db.favorite.deleteMany({ where: { userId: user.id, productId: id } });
      return { isFavorite: false, favoriteCount: await db.favorite.count({ where: { productId: id } }) };
    },

    // T2 — 같은 멱등 키의 두 번째 요청은 기존 상품을 돌려준다 [AC-PC-08, 09]
    async create(user: User, input: CreateProductInput): Promise<{ product: DetailRow; created: boolean }> {
      const existing = await db.product.findFirst({
        where: { sellerId: user.id, idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing !== null) return { product: await findDetail(existing.id), created: false };

      try {
        const id = await db.$transaction(async (tx) => {
          const uploads = await claimUploads(tx, user.id, input.imageIds);
          // 항상 판매중으로 만든다 [AC-PC-03]
          const product = await tx.product.create({
            data: {
              sellerId: user.id,
              title: input.title,
              price: input.price,
              description: input.description,
              idempotencyKey: input.idempotencyKey,
            },
          });
          if (uploads.length > 0) {
            await tx.productImage.createMany({ data: uploads.map((upload, order) => imageRow(product.id, upload, order)) });
          }
          return product.id;
        });
        return { product: await findDetail(id), created: true };
      } catch (err) {
        // 동시에 들어온 같은 키의 요청이 먼저 만들었다 → 그 상품을 돌려준다
        if (uniqueViolationIndex(err) !== 'Product_sellerId_idempotencyKey_key') throw err;
        const winner = await db.product.findFirst({
          where: { sellerId: user.id, idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (winner === null) throw new AppError('NOT_FOUND');
        return { product: await findDetail(winner.id), created: false };
      }
    },

    // T3 — 조건부 UPDATE가 0행이면 404 · 403 [AC-PC-31, 32, 35]
    async update(user: User, id: string, input: UpdateProductInput): Promise<DetailRow> {
      const removedKeys = await db.$transaction(async (tx) => {
        const { count } = await tx.product.updateMany({
          where: { id, sellerId: user.id },
          data: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.price === undefined ? {} : { price: input.price }),
            ...(input.description === undefined ? {} : { description: input.description }),
            // 변경이 없어도 updatedAt은 갱신된다
            updatedAt: new Date(),
          },
        });
        if (count === 0) {
          const reason = await explainMiss(id, user.id);
          throw reason.code === 'INVALID_TRANSITION' ? new AppError('NOT_FOUND') : reason;
        }
        if (input.images === undefined) return [];

        // 최종 목록: 여기 없는 기존 사진 = 삭제, uploadId = 추가, 배열 순서 = 순서
        const current = await tx.productImage.findMany({ where: { productId: id } });
        const currentIds = new Set(current.map((image) => image.id));
        const keptIds = new Set<string>();
        const uploadIds: string[] = [];
        for (const item of input.images) {
          if ('imageId' in item) {
            // 이 상품의 사진이 아닌 id
            if (!currentIds.has(item.imageId)) {
              throw new AppError('VALIDATION_FAILED', { images: '사진을 다시 확인해 주세요' });
            }
            keptIds.add(item.imageId);
          } else {
            uploadIds.push(item.uploadId);
          }
        }
        const uploads = new Map((await claimUploads(tx, user.id, uploadIds)).map((upload) => [upload.id, upload]));

        const removed = current.filter((image) => !keptIds.has(image.id));
        if (removed.length > 0) {
          await tx.productImage.deleteMany({ where: { id: { in: removed.map((image) => image.id) } } });
        }
        for (const [order, item] of input.images.entries()) {
          if ('imageId' in item) {
            await tx.productImage.update({ where: { id: item.imageId }, data: { order } });
          } else {
            const upload = uploads.get(item.uploadId);
            if (upload !== undefined) await tx.productImage.create({ data: imageRow(id, upload, order) });
          }
        }
        return removed.map((image) => image.storageKey);
      });

      // 파일은 커밋 뒤에 지운다 — 트랜잭션 안에서 지우면 롤백 때 되돌릴 수 없다
      if (removedKeys.length > 0) {
        await storage.remove(removedKeys.flatMap((key) => [key, thumbnailKey(key)])).catch(() => {
          // 남은 파일은 정리 배치가 지운다
        });
      }
      await notifyRooms(id);
      return findDetail(id);
    },

    // T4 — 전이 표 · 구매자 확인 · 조건부 UPDATE [AC-PD-01, 02, 05, 06, 07]
    async changeStatus(user: User, id: string, input: ChangeStatusInput): Promise<DetailRow> {
      const product = await db.product.findFirst({ where: { id } });
      if (product === null) throw new AppError('NOT_FOUND');
      if (product.sellerId !== user.id) throw new AppError('FORBIDDEN');

      const from: ProductStatus = product.status;
      const to = input.status;
      // 같은 상태로의 변경은 아무것도 바꾸지 않는다 — 두 번 눌러도 결과가 같다
      if (from === to) return findDetail(id);
      if (!STATUS_TRANSITIONS[from].includes(to)) {
        throw new AppError(
          'INVALID_TRANSITION',
          null,
          `${PRODUCT_STATUS_LABEL[from]}에서 ${PRODUCT_STATUS_LABEL[to]}(으)로는 바꿀 수 없어요`,
        );
      }

      const buyerId = to === 'SOLD' ? (input.buyerId ?? null) : null;
      if (buyerId !== null) {
        // 구매자는 이 상품으로 대화한 사람 중에서만 [AC-PD-05]
        const room = await db.chatRoom.findUnique({
          where: { productId_buyerId: { productId: id, buyerId } },
          select: { id: true },
        });
        if (room === null) throw new AppError('NOT_A_CHAT_PARTNER');
      }

      // 읽은 뒤 바뀌었을 수 있으니 "읽었던 상태일 때만" 갱신한다
      let count: number;
      if (to === 'SOLD') {
        // 거래 시점 가격은 읽어 둔 값이 아니라 갱신되는 행의 값으로 남긴다
        // 읽기와 갱신 사이에 가격 수정이 끼어들어도 가격과 스냅샷이 어긋나지 않는다
        count = await db.$executeRaw`
          UPDATE "Product"
          SET "status" = 'SOLD', "buyerId" = ${buyerId}, "soldAt" = now(), "soldPrice" = "price", "updatedAt" = now()
          WHERE "id" = ${id} AND "sellerId" = ${user.id} AND "status" = ${from}::"ProductStatus" AND "deletedAt" IS NULL`;
      } else {
        // 거래완료에서 되돌리면 구매자 정보가 지워진다 [AC-PD-06]
        ({ count } = await db.product.updateMany({
          where: { id, sellerId: user.id, status: from },
          data: { status: to, buyerId: null, soldAt: null, soldPrice: null },
        }));
      }
      if (count === 0) throw await explainMiss(id, user.id);
      await notifyRooms(id);
      return findDetail(id);
    },

    // T5 — 항상 soft delete [AC-PX-01, 04]
    async remove(user: User, id: string): Promise<void> {
      const { count } = await db.product.updateMany({
        where: { id, sellerId: user.id },
        data: { deletedAt: new Date() },
      });
      if (count === 0) {
        const reason = await explainMiss(id, user.id);
        throw reason.code === 'INVALID_TRANSITION' ? new AppError('NOT_FOUND') : reason;
      }
      await notifyRooms(id);
    },

    // 거래완료 바텀시트 — 이 상품으로 대화한 사람들, 최근 활동순 [AC-PD-04]
    async chatPartners(user: User, id: string) {
      const product = await db.product.findFirst({ where: { id }, select: { sellerId: true } });
      if (product === null) throw new AppError('NOT_FOUND');
      if (product.sellerId !== user.id) throw new AppError('FORBIDDEN');
      const rooms = await db.chatRoom.findMany({ where: { productId: id }, include: { buyer: true } });
      return rooms
        .map((room) => ({ roomId: room.id, user: room.buyer, lastActivityAt: room.lastMessageAt ?? room.createdAt }))
        .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    },
  };
}

// 원본 키 옆에 썸네일을 둔다: a/b.webp → a/b.thumb.webp
export function thumbnailKey(key: string): string {
  return key.replace(/\.webp$/, '.thumb.webp');
}

export type ProductService = ReturnType<typeof createProductService>;

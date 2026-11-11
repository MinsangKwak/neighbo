import type { Db } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ImageStorage } from '../storage/ImageStorage.js';
import { putSeedImage, type SeedImage } from './images.js';

// 시드 상품 한 개의 처음 상태
export interface SeedProduct {
  id: string;
  sellerId: string;
  title: string;
  price: number;
  description: string;
  status: 'ON_SALE' | 'RESERVED' | 'SOLD';
  // SOLD일 때만
  buyerId?: string;
  // 처음 만들 때의 등록 시각 — 지금으로부터 몇 시간 전인지
  hoursAgo: number;
  photos: number;
  // 판매자의 동네
  neighborhood?: string;
}

const HOUR = 60 * 60 * 1000;

// 고정 ID로 upsert한다 — 몇 번을 돌려도 같은 결과
// 이미 있으면 처음 상태로 되돌린다 (제목 · 가격 · 상태 · 사진 · 삭제 여부). 등록 시각은 건드리지 않는다
export async function upsertSeedProduct(
  db: Db,
  storage: ImageStorage,
  spec: SeedProduct,
  images: SeedImage[],
  now: Date,
): Promise<void> {
  // 삭제된 시드 상품도 찾는다 — 기본 조회는 삭제된 행을 빼므로, 그대로면 되살릴 때 시각의 기준이 바뀐다
  const existing = await db.withDeleted().product.findUnique({ where: { id: spec.id }, select: { createdAt: true } });
  const createdAt = existing?.createdAt ?? new Date(now.getTime() - spec.hoursAgo * HOUR);
  // 거래완료 시각은 등록 시각에서 계산한다 — 배포할 때마다 밀리지 않게
  const soldAt = new Date(Math.min(createdAt.getTime() + 20 * HOUR, now.getTime()));
  const sold =
    spec.status === 'SOLD' && spec.buyerId !== undefined
      ? { buyerId: spec.buyerId, soldAt, soldPrice: spec.price }
      : { buyerId: null, soldAt: null, soldPrice: null };
  const data = {
    sellerId: spec.sellerId,
    neighborhood: spec.neighborhood ?? null,
    title: spec.title,
    price: spec.price,
    description: spec.description,
    status: spec.status,
    ...sold,
    deletedAt: null,
    imagesPurgedAt: null,
  };

  // 로컬 저장소는 컨테이너 디스크라 재배포에 비워진다 — 실행할 때마다 다시 쓴다
  // 외부 저장소는 파일이 남으므로 행이 이미 있는 사진은 다시 올리지 않는다 (사진 한 장이 요청 두 번이다)
  const kept =
    storage.localDirectory === null
      ? new Map((await db.productImage.findMany({ where: { productId: spec.id } })).map((row) => [row.id, row]))
      : new Map<string, never>();
  const rows: Prisma.ProductImageCreateManyInput[] = [];
  for (let order = 0; order < spec.photos; order += 1) {
    const id = `${spec.id}_img${order}`;
    const key = `products/seed-${spec.id}-${order}.webp`;
    const existing = kept.get(id);
    // 같은 저장 위치에 올린 것만 다시 쓴다 — 로컬에서 외부로, 또는 다른 버킷으로 옮겼으면 주소가 달라 새로 올린다
    if (existing !== undefined && existing.storageKey === key && existing.url === storage.url(key)) {
      rows.push({ ...existing, order });
      continue;
    }
    const image = images[(spec.hoursAgo + order * 5) % images.length];
    if (image === undefined) continue;
    const stored = await putSeedImage(storage, key, image);
    rows.push({ id, productId: spec.id, order, ...stored });
  }

  await db.$transaction(async (tx) => {
    await tx.product.upsert({
      where: { id: spec.id },
      create: { id: spec.id, idempotencyKey: `seed-${spec.id}`, createdAt, ...data },
      update: data,
    });
    await tx.productImage.deleteMany({ where: { productId: spec.id } });
    if (rows.length > 0) await tx.productImage.createMany({ data: rows });
  });
}

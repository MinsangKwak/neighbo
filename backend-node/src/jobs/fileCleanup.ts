import type { Db } from '../db/client.js';
import { thumbnailKey } from '../modules/products/service.js';
import { UPLOAD_TTL_MS } from '../modules/uploads/ttl.js';
import { DEMO_PRODUCTS } from '../seed/demo.js';
import { SAMPLE_PRODUCTS } from '../seed/sample.js';
import { keyFromUrl, type ImageStorage } from '../storage/ImageStorage.js';

// 파일 정리 — 상품에 붙지 않은 업로드와, 지운 지 오래된 상품의 사진을 치운다
// 근거: docs/architecture/backend.md 07절 4. 배치 작업 [AC-PC-19] [AC-PX-12]

const HOUR = 60 * 60 * 1000;
// 만료된 업로드는 더 붙일 수 없다. 만료 직전에 붙이기 시작한 요청과 겹치지 않게 한 시간을 더 기다린다
export const ORPHAN_UPLOAD_AFTER_MS = UPLOAD_TTL_MS + HOUR;
export const DELETED_PRODUCT_AFTER_MS = 30 * 24 * HOUR;
// DB 어디에도 없는 파일은 일주일이 지난 것만 지운다 — 방금 올려 아직 행이 없는 파일을 건드리지 않게
export const ORPHAN_FILE_AFTER_MS = 7 * 24 * HOUR;
// 큰 삭제가 DB를 오래 잡지 않게 나눠 읽는다
const BATCH = 100;
// 시드 상품은 정리하지 않는다 — 지워진 상품을 되살리는 것은 시드뿐이고, 되살릴 때 이미 올린 파일을 다시 쓴다
// 정리가 파일을 지우는 사이에 되살아나면 살아 있는 상품의 사진이 사라진다. 시드 파일은 시드가 직접 관리한다 (removeSample)
const SEED_PRODUCT_IDS = [...DEMO_PRODUCTS, ...SAMPLE_PRODUCTS].map((product) => product.id);

export interface FileCleanupResult extends Record<string, unknown> {
  uploadsDeleted: number;
  productsPurged: number;
  filesDeleted: number;
  // 파일 삭제가 실패한 건 — 행이 남아 다음 실행에서 다시 시도한다
  failed: number;
  // DB 어디에도 없어 지운 파일
  orphansDeleted: number;
  // 고아 파일 정리를 건너뛴 이유 — 지우기 전에 이상을 알아챈 경우
  orphansSkipped?: 'foreign-avatars' | 'too-many';
}

// 파일을 먼저 지우고 행을 지운다 — 행을 먼저 지우면 키를 잃어 파일을 영영 못 지운다
async function removeFiles(storage: ImageStorage, keys: string[]): Promise<boolean> {
  try {
    await storage.remove(keys);
    return true;
  } catch {
    return false;
  }
}

async function cleanOrphanUploads(db: Db, storage: ImageStorage, now: Date, result: FileCleanupResult): Promise<void> {
  const before = new Date(now.getTime() - ORPHAN_UPLOAD_AFTER_MS);
  let cursor = '';
  for (;;) {
    const uploads = await db.upload.findMany({
      where: { createdAt: { lt: before }, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, storageKey: true, thumbnailUrl: true },
    });
    if (uploads.length === 0) return;
    for (const upload of uploads) {
      cursor = upload.id;
      // 상품 사진은 원본과 썸네일 두 벌, 아바타는 한 벌
      const keys = upload.thumbnailUrl === null ? [upload.storageKey] : [upload.storageKey, thumbnailKey(upload.storageKey)];
      if (!(await removeFiles(storage, keys))) {
        result.failed += 1;
        continue;
      }
      await db.upload.deleteMany({ where: { id: upload.id } });
      result.uploadsDeleted += 1;
      result.filesDeleted += keys.length;
    }
  }
}

async function purgeDeletedProducts(db: Db, storage: ImageStorage, now: Date, result: FileCleanupResult): Promise<void> {
  const before = new Date(now.getTime() - DELETED_PRODUCT_AFTER_MS);
  // 기본 조회는 삭제된 상품을 뺀다 — 여기서는 삭제된 것만 본다
  const all = db.withDeleted();
  let cursor = '';
  for (;;) {
    const products = await all.product.findMany({
      where: { deletedAt: { lt: before }, imagesPurgedAt: null, id: { gt: cursor, notIn: SEED_PRODUCT_IDS } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, images: { select: { storageKey: true } } },
    });
    if (products.length === 0) return;
    for (const product of products) {
      cursor = product.id;
      const keys = product.images.flatMap((image) => [image.storageKey, thumbnailKey(image.storageKey)]);
      if (!(await removeFiles(storage, keys))) {
        result.failed += 1;
        continue;
      }
      // 삭제는 되돌릴 수 없으므로 조건이 바뀔 일은 없지만, 같은 조건을 한 번 더 건다
      const purged = await db.$transaction(async (tx) => {
        const count = await tx.$executeRaw`
          UPDATE "Product" SET "imagesPurgedAt" = ${now}
          WHERE "id" = ${product.id} AND "deletedAt" < ${before} AND "imagesPurgedAt" IS NULL`;
        if (count === 0) return false;
        await tx.productImage.deleteMany({ where: { productId: product.id } });
        return true;
      });
      if (!purged) continue;
      result.productsPurged += 1;
      result.filesDeleted += keys.length;
    }
  }
}

// 커밋 뒤의 파일 삭제가 실패하면 파일만 남는다. 행이 없으니 위의 두 정리로는 찾을 수 없다
// 저장소의 파일 목록과 DB가 아는 키를 맞대어, 어디에도 없는 오래된 파일을 지운다
async function sweepOrphanFiles(db: Db, storage: ImageStorage, now: Date, result: FileCleanupResult): Promise<void> {
  const files = await storage.list();
  if (files.length === 0) return;

  const [images, uploads, users] = await Promise.all([
    db.productImage.findMany({ select: { storageKey: true } }),
    db.upload.findMany({ select: { storageKey: true } }),
    db.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
  ]);
  const known = new Set<string>();
  for (const { storageKey } of [...images, ...uploads]) {
    known.add(storageKey);
    known.add(thumbnailKey(storageKey));
  }
  for (const { avatarUrl } of users) {
    const key = keyFromUrl(storage, avatarUrl);
    // 이 저장소의 주소가 아닌 아바타가 있으면 어느 파일이 쓰이는지 알 수 없다 — 지우지 않는다
    if (key === null) {
      result.orphansSkipped = 'foreign-avatars';
      return;
    }
    known.add(key);
  }

  const before = now.getTime() - ORPHAN_FILE_AFTER_MS;
  const orphans = files.filter((file) => !known.has(file.key) && file.modifiedAt.getTime() < before).map((file) => file.key);
  // 절반 넘게 고아로 보이면 파일이 아니라 판단이 틀렸을 가능성이 크다 (키 규칙이 바뀌었거나 DB가 비었거나)
  if (orphans.length > 20 && orphans.length > files.length / 2) {
    result.orphansSkipped = 'too-many';
    return;
  }
  for (let start = 0; start < orphans.length; start += BATCH) {
    const keys = orphans.slice(start, start + BATCH);
    if (await removeFiles(storage, keys)) result.orphansDeleted += keys.length;
    else result.failed += keys.length;
  }
}

export async function cleanFiles(db: Db, storage: ImageStorage, now = new Date()): Promise<FileCleanupResult> {
  const result: FileCleanupResult = { uploadsDeleted: 0, productsPurged: 0, filesDeleted: 0, failed: 0, orphansDeleted: 0 };
  await cleanOrphanUploads(db, storage, now, result);
  await purgeDeletedProducts(db, storage, now, result);
  // 위의 두 정리가 끝난 뒤에 본다 — 방금 행을 지운 파일은 이미 지워져 있다
  await sweepOrphanFiles(db, storage, now, result);
  return result;
}

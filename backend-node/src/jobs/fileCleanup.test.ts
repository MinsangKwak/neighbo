import { existsSync } from 'node:fs';
import { rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb, storage } from '../../test/app.js';
import { thumbnailKey } from '../modules/products/service.js';
import { createLocalStorage, type ImageStorage } from '../storage/ImageStorage.js';
import { cleanFiles } from './fileCleanup.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date('2026-11-11T18:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const onDisk = (key: string) => existsSync(join(storage.localDirectory ?? '', key));

let userId: string;

beforeEach(async () => {
  await resetDb();
  const user = await db.user.create({
    data: { email: 'cleanup@example.com', passwordHash: 'x', nickname: '정리', nicknameLower: '정리' },
  });
  userId = user.id;
});

async function upload(name: string, kind: 'PRODUCT' | 'AVATAR', createdAt: Date) {
  const key = `${kind === 'PRODUCT' ? 'products' : 'avatars'}/cleanup-${name}.webp`;
  await storage.put(key, Buffer.from(name), 'image/webp');
  if (kind === 'PRODUCT') await storage.put(thumbnailKey(key), Buffer.from(name), 'image/webp');
  await db.upload.create({
    data: {
      uploaderId: userId,
      kind,
      storageKey: key,
      url: storage.url(key),
      thumbnailUrl: kind === 'PRODUCT' ? storage.url(thumbnailKey(key)) : null,
      width: 10,
      height: 10,
      createdAt,
    },
  });
  return key;
}

async function product(name: string, deletedAt: Date | null) {
  const key = `products/cleanup-${name}.webp`;
  await storage.put(key, Buffer.from(name), 'image/webp');
  await storage.put(thumbnailKey(key), Buffer.from(name), 'image/webp');
  const row = await db.product.create({
    data: {
      sellerId: userId,
      title: name,
      price: 1000,
      description: '',
      idempotencyKey: `cleanup-${name}`,
      deletedAt,
      images: {
        create: { storageKey: key, url: storage.url(key), thumbnailUrl: storage.url(thumbnailKey(key)), width: 10, height: 10, order: 0 },
      },
    },
  });
  return { id: row.id, key };
}

describe('고아 업로드 정리', () => {
  it('AC-PC-19 만료된 뒤 한 시간이 지난 업로드는 파일 두 벌과 행을 지우고, 그보다 새 것은 둔다', async () => {
    const old = await upload('old', 'PRODUCT', ago(26 * HOUR));
    const avatar = await upload('avatar', 'AVATAR', ago(3 * DAY));
    // 만료(24시간)는 지났지만 붙이는 중인 요청과 겹칠 수 있는 구간
    const edge = await upload('edge', 'PRODUCT', ago(24 * HOUR + 30 * 60 * 1000));
    const fresh = await upload('fresh', 'PRODUCT', ago(HOUR));

    const result = await cleanFiles(db, storage, now);

    expect(result).toMatchObject({ uploadsDeleted: 2, filesDeleted: 3, failed: 0 });
    expect([old, thumbnailKey(old), avatar].map(onDisk)).toEqual([false, false, false]);
    expect([edge, thumbnailKey(edge), fresh].map(onDisk)).toEqual([true, true, true]);
    expect((await db.upload.findMany({ orderBy: { createdAt: 'asc' } })).map((row) => row.storageKey)).toEqual([edge, fresh]);
  });

  it('파일 삭제가 실패하면 행을 남겨 다음 실행에서 다시 지운다', async () => {
    const key = await upload('retry', 'PRODUCT', ago(2 * DAY));
    const broken: ImageStorage = { ...storage, remove: () => Promise.reject(new Error('저장소가 응답하지 않는다')) };

    expect(await cleanFiles(db, broken, now)).toMatchObject({ uploadsDeleted: 0, failed: 1 });
    expect(await db.upload.count()).toBe(1);

    expect(await cleanFiles(db, storage, now)).toMatchObject({ uploadsDeleted: 1, failed: 0 });
    expect(onDisk(key)).toBe(false);
    expect(await db.upload.count()).toBe(0);
  });

  it('한 번에 읽는 양(100건)을 넘어도 끝까지 지운다', async () => {
    await db.upload.createMany({
      data: Array.from({ length: 230 }, (_, index) => ({
        uploaderId: userId,
        kind: 'AVATAR' as const,
        storageKey: `avatars/cleanup-many-${index}.webp`,
        url: `/files/avatars/cleanup-many-${index}.webp`,
        width: 10,
        height: 10,
        createdAt: ago(2 * DAY),
      })),
    });

    expect(await cleanFiles(db, storage, now)).toMatchObject({ uploadsDeleted: 230 });
    expect(await db.upload.count()).toBe(0);
  });
});

describe('삭제 상품 이미지 정리', () => {
  it('AC-PX-12 지운 지 30일이 넘은 상품만 사진 파일과 행을 지우고 정리 시각을 남긴다', async () => {
    const old = await product('old', ago(31 * DAY));
    const recent = await product('recent', ago(29 * DAY));
    const live = await product('live', null);

    const result = await cleanFiles(db, storage, now);

    expect(result).toMatchObject({ productsPurged: 1, filesDeleted: 2, failed: 0 });
    expect([old.key, thumbnailKey(old.key)].map(onDisk)).toEqual([false, false]);
    expect([recent.key, live.key].map(onDisk)).toEqual([true, true]);
    expect(await db.productImage.count({ where: { productId: old.id } })).toBe(0);
    expect(await db.productImage.count({ where: { productId: { in: [recent.id, live.id] } } })).toBe(2);
    const rows = await db.withDeleted().product.findMany({ where: { id: { in: [old.id, recent.id, live.id] } } });
    expect(Object.fromEntries(rows.map((row) => [row.title, row.imagesPurgedAt]))).toEqual({
      old: now,
      recent: null,
      live: null,
    });
  });

  it('시드 상품은 지운 지 오래돼도 건드리지 않는다 — 되살릴 때 올려 둔 파일을 다시 쓴다', async () => {
    const seed = await product('seed', ago(40 * DAY));
    // 사진 행은 외래 키(ON UPDATE CASCADE)를 따라 함께 옮겨진다
    await db.$executeRaw`UPDATE "Product" SET "id" = 'demo_p1' WHERE "id" = ${seed.id}`;

    expect(await cleanFiles(db, storage, now)).toMatchObject({ productsPurged: 0, filesDeleted: 0 });
    expect(onDisk(seed.key)).toBe(true);
    expect(await db.productImage.count({ where: { productId: 'demo_p1' } })).toBe(1);
  });

  it('이미 정리한 상품은 다시 세지 않는다', async () => {
    await product('once', ago(40 * DAY));
    expect(await cleanFiles(db, storage, now)).toMatchObject({ productsPurged: 1 });
    expect(await cleanFiles(db, storage, now)).toMatchObject({ productsPurged: 0, filesDeleted: 0 });
  });

  it('파일 삭제가 실패하면 사진 행과 정리 시각을 건드리지 않는다', async () => {
    const target = await product('retry', ago(40 * DAY));
    const broken: ImageStorage = { ...storage, remove: () => Promise.reject(new Error('저장소가 응답하지 않는다')) };

    expect(await cleanFiles(db, broken, now)).toMatchObject({ productsPurged: 0, failed: 1 });
    expect(await db.productImage.count({ where: { productId: target.id } })).toBe(1);
    expect((await db.withDeleted().product.findUniqueOrThrow({ where: { id: target.id } })).imagesPurgedAt).toBeNull();
  });
});

describe('고아 파일 정리', () => {
  // 다른 테스트의 파일과 섞이지 않게 따로 둔다
  const directory = '.data/test-orphans';
  const own = createLocalStorage(directory, '/files');
  const place = async (key: string, age: number) => {
    await own.put(key, Buffer.from(key), 'image/webp');
    const at = ago(age);
    await utimes(join(directory, key), at, at);
  };
  const remaining = async () => (await own.list()).map((file) => file.key).sort();

  beforeEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('DB 어디에도 없고 일주일이 지난 파일만 지운다 — 상품 사진 · 업로드 · 아바타가 쓰는 파일은 둔다', async () => {
    const image = 'products/in-use.webp';
    for (const key of [image, thumbnailKey(image), 'products/upload.webp', 'avatars/mine.webp']) await place(key, 30 * DAY);
    await place('products/left-behind.webp', 8 * DAY);
    await place('products/left-behind.thumb.webp', 8 * DAY);
    // 방금 올려 아직 행이 없을 수 있는 파일
    await place('products/just-uploaded.webp', DAY);
    await db.product.create({
      data: {
        sellerId: userId,
        title: '쓰는 사진',
        price: 1000,
        description: '',
        idempotencyKey: 'orphans',
        images: { create: { storageKey: image, url: own.url(image), thumbnailUrl: own.url(thumbnailKey(image)), width: 10, height: 10, order: 0 } },
      },
    });
    await db.upload.create({
      data: { uploaderId: userId, kind: 'AVATAR', storageKey: 'products/upload.webp', url: own.url('products/upload.webp'), width: 10, height: 10, createdAt: ago(HOUR) },
    });
    await db.user.update({ where: { id: userId }, data: { avatarUrl: own.url('avatars/mine.webp') } });

    const result = await cleanFiles(db, own, now);

    expect(result).toMatchObject({ orphansDeleted: 2, failed: 0 });
    expect(result.orphansSkipped).toBeUndefined();
    expect(await remaining()).toEqual([
      'avatars/mine.webp',
      'products/in-use.thumb.webp',
      'products/in-use.webp',
      'products/just-uploaded.webp',
      'products/upload.webp',
    ]);
  });

  it('다른 저장소의 주소를 가진 아바타가 있으면 아무것도 지우지 않는다 — 어느 파일이 쓰이는지 알 수 없다', async () => {
    await place('avatars/old-location.webp', 30 * DAY);
    await db.user.update({ where: { id: userId }, data: { avatarUrl: 'https://elsewhere.example.com/avatars/old-location.webp' } });

    const result = await cleanFiles(db, own, now);

    expect(result).toMatchObject({ orphansDeleted: 0, orphansSkipped: 'foreign-avatars' });
    expect(await remaining()).toEqual(['avatars/old-location.webp']);
  });

  it('파일의 절반 넘게 고아로 보이면 지우지 않는다 — 파일이 아니라 판단이 틀렸을 가능성이 크다', async () => {
    for (let index = 0; index < 30; index += 1) await place(`products/unknown-${index}.webp`, 30 * DAY);

    const result = await cleanFiles(db, own, now);

    expect(result).toMatchObject({ orphansDeleted: 0, orphansSkipped: 'too-many' });
    expect(await remaining()).toHaveLength(30);
  });

  it('저장소가 비어 있으면 DB를 읽지도 않고 끝낸다', async () => {
    expect(await cleanFiles(db, own, now)).toMatchObject({ orphansDeleted: 0 });
  });
});

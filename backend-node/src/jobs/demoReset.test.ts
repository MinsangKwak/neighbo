import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, db, resetDb, storage } from '../../test/app.js';
import { baseEnv } from '../../test/env.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../lib/log.js';
import { createPasswordHasher } from '../lib/password.js';
import { DEMO_PRODUCTS, seedDemoAccounts, seedDemoProducts } from '../seed/demo.js';
import { drawSeedImages, type SeedImage } from '../seed/images.js';
import { removeSample, SAMPLE_ROOMS, seedSample } from '../seed/sample.js';
import { resetDemo } from './demoReset.js';
import { missedRun, nextRunAt, runLocked, startDaily } from './scheduler.js';

const hasher = await createPasswordHasher(10);
let images: SeedImage[];
const silent = createLogger('error', () => undefined);

beforeAll(async () => {
  images = await drawSeedImages(12);
});

beforeEach(async () => {
  await resetDb();
  await seedDemoAccounts(db, hasher, 'demo password 1');
  await seedDemoProducts(db, storage, images);
});

async function realUser(nickname: string) {
  return db.user.create({
    data: { email: `${nickname}@example.com`, passwordHash: 'x', nickname, nicknameLower: nickname },
  });
}

describe('데모 초기화', () => {
  it('데모 계정이 올린 상품을 지우고, 시드 상품과 프로필을 처음 상태로 되돌린다', async () => {
    await db.product.create({
      data: { sellerId: 'demo_seller', title: '앞사람이 올린 물건', price: 1000, description: '', idempotencyKey: 'k1' },
    });
    await db.product.update({ where: { id: 'demo_p1' }, data: { title: '바뀐 제목', status: 'RESERVED' } });
    await db.user.update({ where: { id: 'demo_seller' }, data: { avatarUrl: '/api/files/avatars/x.webp' } });

    const result = await resetDemo(db, storage, { sample: false });

    expect(result).toMatchObject({ productsDeleted: 1, roomsDeleted: 0 });
    expect(await db.product.count({ where: { sellerId: 'demo_seller' } })).toBe(DEMO_PRODUCTS.length);
    expect(await db.product.findUniqueOrThrow({ where: { id: 'demo_p1' } })).toMatchObject({
      title: DEMO_PRODUCTS[0]?.title,
      status: 'ON_SALE',
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: 'demo_seller' } })).avatarUrl).toBeNull();
  });

  it('두 데모 계정 사이의 방은 메시지째 지우고, 일반 사용자와의 방은 남기되 읽음으로 둔다', async () => {
    const { chat } = createTestApp();
    const between = await chat.open('demo_buyer', 'demo_p1');
    await chat.send('demo_buyer', { roomId: between.room.id, content: '앞사람의 대화', tempId: 't1' });
    const visitor = await realUser('방문자');
    const kept = await chat.open(visitor.id, 'demo_p2');
    await chat.send(visitor.id, { roomId: kept.room.id, content: '일반 사용자의 문의', tempId: 't2' });

    const result = await resetDemo(db, storage, { sample: false });

    expect(result.roomsDeleted).toBe(1);
    expect(await db.chatRoom.findUnique({ where: { id: between.room.id } })).toBeNull();
    expect(await db.message.count({ where: { roomId: between.room.id } })).toBe(0);
    // 일반 사용자의 기록은 그대로다
    expect(await db.message.count({ where: { roomId: kept.room.id } })).toBe(1);
    const member = await db.chatRoomMember.findFirstOrThrow({ where: { roomId: kept.room.id, userId: 'demo_seller' } });
    expect(member.lastReadSeq).toBe(1);
    // 상대의 읽음 위치는 건드리지 않는다
    const other = await db.chatRoomMember.findFirstOrThrow({ where: { roomId: kept.room.id, userId: visitor.id } });
    expect(other.lastReadSeq).toBe(1);
  });

  it('데모 계정이 올린 상품이 지워져도 일반 사용자와의 방은 열람용으로 남는다', async () => {
    const { chat } = createTestApp();
    const extra = await db.product.create({
      data: { sellerId: 'demo_seller', title: '앞사람이 올린 물건', price: 1000, description: '', idempotencyKey: 'k2' },
    });
    const visitor = await realUser('방문자둘');
    const room = await chat.open(visitor.id, extra.id);
    await chat.send(visitor.id, { roomId: room.room.id, content: '안녕하세요', tempId: 't1' });

    await resetDemo(db, storage, { sample: false });

    const detail = await chat.detail(visitor.id, room.room.id);
    expect(detail.product.deletedAt).not.toBeNull();
    expect(await db.message.count({ where: { roomId: room.room.id } })).toBe(1);
  });

  it('샘플 방은 앞사람의 대화를 치우고 시드의 메시지 수와 읽지 않은 수로 되돌린다', async () => {
    await seedSample(db, storage, images);
    const { chat } = createTestApp();
    const room = SAMPLE_ROOMS[1];
    if (room === undefined) throw new Error('방 정의가 없다');
    await chat.send('demo_buyer', { roomId: room.id, content: '앞사람의 대화', tempId: 'live' });
    await chat.markRead('demo_buyer', room.id, room.count + 1);

    const result = await resetDemo(db, storage, { sample: true });

    expect(result.sampleRoomsRestored).toBe(SAMPLE_ROOMS.length);
    expect(await db.chatRoom.count()).toBe(SAMPLE_ROOMS.length);
    expect(await db.message.count()).toBe(300);
    expect(await db.message.count({ where: { content: '앞사람의 대화' } })).toBe(0);
    // 같은 상품 × 구매자의 방이 새 ID로 다시 생긴다 — 옛 방을 열어 둔 화면이 번호를 섞지 않게
    expect(await db.chatRoom.findUnique({ where: { id: room.id } })).toBeNull();
    const fresh = await db.chatRoom.findFirstOrThrow({ where: { productId: room.productId, buyerId: room.buyerId } });
    expect(fresh.id).not.toBe(room.id);
    expect(fresh.lastSeq).toBe(room.count);
    const member = await db.chatRoomMember.findFirstOrThrow({ where: { roomId: fresh.id, userId: 'demo_buyer' } });
    expect(member.lastReadSeq).toBeLessThan(room.count);

    // 한 번 더 돌려도 방 수는 그대로다
    await resetDemo(db, storage, { sample: true }, new Date(Date.now() + 86_400_000));
    expect(await db.chatRoom.count()).toBe(SAMPLE_ROOMS.length);
    expect(await db.message.count()).toBe(300);
  });

  it('데모 계정이 없으면 아무것도 하지 않는다', async () => {
    await resetDb();
    expect(await resetDemo(db, storage, { sample: false })).toMatchObject({ skipped: 'no-demo-accounts' });
  });
});

describe('샘플 데이터 삭제', () => {
  it('샘플 사용자 · 상품 · 방을 지우고 데모 데이터와 일반 사용자는 남긴다', async () => {
    await seedSample(db, storage, images);
    const { chat } = createTestApp();
    const visitor = await realUser('방문자셋');
    // 일반 사용자가 샘플 상품에 연 방도 함께 지운다
    await chat.open(visitor.id, 'sample_p01');

    const removed = await removeSample(db, storage);

    expect(removed).toEqual({ users: 10, products: 60, rooms: 16 });
    expect(await db.user.count()).toBe(3);
    expect(await db.withDeleted().product.count()).toBe(DEMO_PRODUCTS.length);
    expect(await db.chatRoom.count()).toBe(0);
    expect(await db.message.count()).toBe(0);
    expect(await db.productImage.count({ where: { productId: { startsWith: 'sample_' } } })).toBe(0);
    // 다시 넣을 수 있다
    expect((await seedSample(db, storage, images)).products).toBe(60);
  });

  it('SEED_SAMPLE=remove는 DEMO_PASSWORD 없이도 받는다', () => {
    expect(loadConfig({ ...baseEnv, SEED_SAMPLE: 'remove' }).SEED_SAMPLE).toBe('remove');
  });
});

describe('스케줄러', () => {
  it('다음 실행 시각은 지금 이후 가장 가까운 04:00 KST다', () => {
    // 03:59 KST → 같은 날 04:00 KST(= 전날 19:00 UTC)
    expect(nextRunAt(new Date('2026-11-10T18:59:00Z'), 4).toISOString()).toBe('2026-11-10T19:00:00.000Z');
    // 정각에는 다음 날로 넘긴다 — 방금 돈 작업이 곧바로 또 돌지 않게
    expect(nextRunAt(new Date('2026-11-10T19:00:00Z'), 4).toISOString()).toBe('2026-11-11T19:00:00.000Z');
    expect(nextRunAt(new Date('2026-11-11T03:00:00Z'), 4).toISOString()).toBe('2026-11-11T19:00:00.000Z');
  });

  it('같은 작업이 겹치면 한쪽만 돈다', async () => {
    let running = 0;
    let most = 0;
    let runs = 0;
    const job = {
      name: 'test',
      hourKst: 4,
      lockKey: 990001,
      run: async () => {
        running += 1;
        runs += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 150));
        running -= 1;
        return {};
      },
    };
    const results = await Promise.all([runLocked(db, silent, job), runLocked(db, silent, job)]);
    expect(results.sort()).toEqual([false, true]);
    expect(runs).toBe(1);
    expect(most).toBe(1);
  });

  it('작업이 실패해도 예외를 밖으로 던지지 않는다', async () => {
    const failing = {
      name: 'fail',
      hourKst: 4,
      lockKey: 990002,
      run: () => Promise.reject(new Error('boom')),
    };
    expect(await runLocked(db, silent, failing)).toBe(false);
  });
});

describe('데모 초기화와 관심', () => {
  it('AC-FV-09 데모 계정이 눌러 둔 관심을 지우고, 일반 사용자의 관심은 둔다', async () => {
    const real = await realUser('관심이');
    await db.favorite.createMany({
      data: [
        { userId: 'demo_buyer', productId: 'demo_p1' },
        { userId: real.id, productId: 'demo_p1' },
      ],
    });

    await resetDemo(db, storage, { sample: false });

    expect((await db.favorite.findMany()).map((row) => row.userId)).toEqual([real.id]);
  });
});

describe('놓친 실행 따라잡기', () => {
  const job = (run = () => Promise.resolve({ done: 1 })) => ({ name: 'catch-up-test', hourKst: 4, lockKey: 49901, run });
  // 2026-11-11 10:00 KST — 가장 최근의 예정 시각은 같은 날 04:00 KST
  const now = new Date('2026-11-11T01:00:00Z');

  it('돈 적이 없거나, 가장 최근의 예정 시각 뒤로 돈 적이 없으면 놓친 것이다', async () => {
    expect(await missedRun(db, job(), now)).toBe(true);

    // 어제 04:05 KST에 돌았다 — 오늘 04:00을 놓쳤다
    await db.jobRun.create({ data: { name: 'catch-up-test', ranAt: new Date('2026-11-09T19:05:00Z') } });
    expect(await missedRun(db, job(), now)).toBe(true);

    // 오늘 04:00 KST 뒤에 돌았다
    await db.jobRun.update({ where: { name: 'catch-up-test' }, data: { ranAt: new Date('2026-11-10T19:00:05Z') } });
    expect(await missedRun(db, job(), now)).toBe(false);
  });

  it('성공한 실행만 끝난 시각을 남긴다 — 실패한 실행은 다음에 다시 따라잡는다', async () => {
    await runLocked(db, silent, job(() => Promise.reject(new Error('저장소가 응답하지 않는다'))));
    expect(await db.jobRun.count()).toBe(0);

    await runLocked(db, silent, job());
    expect(await db.jobRun.count()).toBe(1);
  });

  it('켜질 때 놓친 실행이 있으면 한 번 돌리고, 없으면 돌리지 않는다', async () => {
    let runs = 0;
    const counted = job(() => Promise.resolve({ done: (runs += 1) }));

    const first = startDaily(db, silent, counted, () => now);
    expect(await first.caughtUp).toBe(true);
    first.stop();
    expect(runs).toBe(1);

    // 방금 돌았으므로 다시 켜져도 돌리지 않는다 (배포가 잦아도 하루 한 번)
    const second = startDaily(db, silent, counted, () => new Date());
    expect(await second.caughtUp).toBe(false);
    second.stop();
    expect(runs).toBe(1);
  });
});

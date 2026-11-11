import type { Db } from '../db/client.js';
import { DEMO_ACCOUNTS, DEMO_PRODUCTS, seedDemoProducts } from '../seed/demo.js';
import { drawSeedImages } from '../seed/images.js';
import { SAMPLE_ROOMS, seedSample } from '../seed/sample.js';
import type { ImageStorage } from '../storage/ImageStorage.js';

// 데모 초기화 — 공용 계정에 앞사람이 남긴 것을 치우고 시드 상태로 되돌린다
// 근거: docs/architecture/backend.md 11절 5. 데모 계정의 제한과 초기화 [AC-LI-19]

export interface DemoResetResult extends Record<string, unknown> {
  // 두 데모 계정이 모두 있어야 돈다
  skipped?: 'no-demo-accounts';
  productsDeleted: number;
  roomsDeleted: number;
  sampleRoomsRestored: number;
}

async function deleteRooms(db: Db, roomIds: string[]): Promise<number> {
  if (roomIds.length === 0) return 0;
  // 메시지를 지우는 유일한 곳이다 — 공용 계정의 대화가 다음 사람에게 보이지 않게
  await db.$transaction([
    db.message.deleteMany({ where: { roomId: { in: roomIds } } }),
    db.chatRoomMember.deleteMany({ where: { roomId: { in: roomIds } } }),
    db.chatRoom.deleteMany({ where: { id: { in: roomIds } } }),
  ]);
  return roomIds.length;
}

export async function resetDemo(
  db: Db,
  storage: ImageStorage,
  options: { sample: boolean },
  now = new Date(),
): Promise<DemoResetResult> {
  const result: DemoResetResult = { productsDeleted: 0, roomsDeleted: 0, sampleRoomsRestored: 0 };
  const demoIds = DEMO_ACCOUNTS.map((account) => account.id);
  const present = await db.user.count({ where: { id: { in: demoIds }, isDemo: true } });
  if (present !== demoIds.length) return { ...result, skipped: 'no-demo-accounts' };

  // ① 데모 계정이 올린 상품 중 시드가 아닌 것을 지운다 (soft delete — 일반 사용자와의 방은 열람용으로 남는다)
  const deleted = await db.product.updateMany({
    where: { sellerId: { in: demoIds }, id: { notIn: DEMO_PRODUCTS.map((product) => product.id) }, deletedAt: null },
    data: { deletedAt: now },
  });
  result.productsDeleted = deleted.count;

  // ② 시드 상품을 처음 상태로
  const images = await drawSeedImages(12);
  await seedDemoProducts(db, storage, images, now);

  // 공용 계정이 눌러 둔 관심도 다음 사람에게 넘기지 않는다 [AC-FV-09]
  await db.favorite.deleteMany({ where: { userId: { in: demoIds } } });

  // ③ 두 데모 계정 사이의 방은 메시지째 지운다
  const between = await db.chatRoom.findMany({
    where: { sellerId: { in: demoIds }, buyerId: { in: demoIds } },
    select: { id: true },
  });
  result.roomsDeleted = await deleteRooms(
    db,
    between.map((room) => room.id),
  );

  // 샘플 방은 한쪽이 데모 계정이라 앞사람의 대화가 쌓인다 — 지우고 처음 상태로 다시 만든다
  // 새 방은 새 ID로 만든다. 같은 ID를 다시 쓰면 방을 열어 둔 화면이 옛 메시지 번호와 새 번호를 섞어, 새 메시지를 조용히 버린다
  // 옛 방을 열어 둔 화면은 ③의 방과 똑같이 "없는 방"이 된다
  const samplePairs = SAMPLE_ROOMS.map((room) => ({ productId: room.productId, buyerId: room.buyerId }));
  if (options.sample) {
    const stale = await db.withDeleted().chatRoom.findMany({ where: { OR: samplePairs }, select: { id: true } });
    await deleteRooms(
      db,
      stale.map((room) => room.id),
    );
    const sample = await seedSample(db, storage, images, now, `_${now.getTime().toString(36)}`);
    result.sampleRoomsRestored = sample.rooms;
  }

  // ④ 프로필을 시드 값으로. 비밀번호와 tokenVersion은 건드리지 않는다 — 접속 중인 사람을 내보내지 않는다
  for (const account of DEMO_ACCOUNTS) {
    await db.user.update({
      where: { id: account.id },
      data: {
        nickname: account.nickname,
        nicknameLower: account.nickname.toLowerCase(),
        avatarUrl: null,
        neighborhood: account.neighborhood,
      },
    });
  }
  // 일반 사용자와의 방은 남는다. 앞사람이 안 읽은 표시가 다음 사람에게 넘어가지 않게 모두 읽음으로 둔다
  // (샘플 방은 방금 다시 만들어 시드의 읽지 않은 수를 그대로 갖는다)
  const sampleRoomIds = (await db.withDeleted().chatRoom.findMany({ where: { OR: samplePairs }, select: { id: true } })).map(
    (room) => room.id,
  );
  await db.$executeRaw`
    UPDATE "ChatRoomMember" AS m
    SET "lastReadSeq" = r."lastSeq"
    FROM "ChatRoom" AS r
    WHERE r.id = m."roomId"
      AND m."userId" = ANY(${demoIds})
      AND NOT (m."roomId" = ANY(${sampleRoomIds}))
      AND m."lastReadSeq" < r."lastSeq"`;

  return result;
}

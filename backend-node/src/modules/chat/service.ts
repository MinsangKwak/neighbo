import {
  MISSED_MAX,
  normalizeText,
  type ListChatRoomsQuery,
  type ListMessagesQuery,
  type Message,
  type MessageSendInput,
  type NotificationUnreadEvent,
} from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { uniqueViolationIndex } from '../../db/errors.js';
import { AppError } from '../../errors/AppError.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { decodeCursor, decodeSeqCursor, encodeCursor, encodeSeqCursor } from '../../lib/cursor.js';
import type { Realtime } from '../../realtime/Realtime.js';
import { toUserPublic } from '../auth/serialize.js';
import { toMessage } from './serialize.js';

// 삭제된 상품의 방에는 보낼 수 없다 [AC-CH-18]. 소켓에서만 생기는 거절이라 HTTP 카탈로그에 없다
export class ProductDeletedError extends Error {
  constructor() {
    super('삭제된 상품의 방에는 메시지를 보낼 수 없다');
    this.name = 'ProductDeletedError';
  }
}

// 목록 미리보기 — 한 줄로 만들고 100자에서 자른다 [CL-OK-06]
const PREVIEW_MAX = 100;
export function toPreview(content: string): string {
  return Array.from(normalizeText(content)).slice(0, PREVIEW_MAX).join('');
}

// 같은 방에서 이 시간 안에 이어진 메시지는 토스트 하나로 합친다 [AC-NT-06]
const BURST_WINDOW_MS = 5000;

const roomInclude = {
  // 삭제된 상품도 요약은 보여야 한다. 대표 사진만
  product: { include: { images: { orderBy: { order: 'asc' }, take: 1 } } },
  seller: true,
  buyer: true,
} satisfies Prisma.ChatRoomInclude;

export function createChatService(db: Db, realtime: Realtime) {
  // 방 조회는 삭제된 상품까지 봐야 한다 — 걸러 내는 확장을 거치지 않는 클라이언트를 명시해서 쓴다 [CL-DT-24]
  const all = db.withDeleted();

  async function isMember(userId: string, roomId: string): Promise<boolean> {
    const member = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { roomId: true },
    });
    return member !== null;
  }

  // 참여자가 아니면 방이 있다는 사실도 숨긴다 [AC-CH-10, B04]
  async function assertMember(userId: string, roomId: string): Promise<void> {
    if (!(await isMember(userId, roomId))) throw new AppError('NOT_FOUND');
  }

  // 읽지 않은 메시지가 있는 방의 수 — Message를 세지 않는다 [AC-NT-02]
  async function unreadRooms(userId: string): Promise<number> {
    const rows = await db.$queryRaw<{ rooms: number }[]>`
      SELECT COUNT(*)::int AS "rooms"
      FROM "ChatRoomMember" m JOIN "ChatRoom" r ON r."id" = m."roomId"
      WHERE m."userId" = ${userId} AND r."lastSeq" > m."lastReadSeq"`;
    return rows[0]?.rooms ?? 0;
  }

  async function detail(userId: string, roomId: string) {
    const room = await all.chatRoom.findUnique({ where: { id: roomId }, include: { ...roomInclude, members: true } });
    if (room === null || !room.members.some((member) => member.userId === userId)) throw new AppError('NOT_FOUND');
    return room;
  }

  return {
    isMember,
    unreadRooms,
    detail,

    // T6 — 방은 상품 × 구매자당 하나. 이미 있으면 그 방을 돌려준다 [AC-PD-12~16, 20]
    async open(userId: string, productId: string) {
      const existingId = () =>
        db.chatRoom
          .findUnique({ where: { productId_buyerId: { productId, buyerId: userId } }, select: { id: true } })
          .then((room) => room?.id ?? null);

      let result: { id: string; created: boolean };
      try {
        result = await db.$transaction(async (tx) => {
          // 진행 중인 삭제가 있으면 끝날 때까지 기다렸다가 삭제된 결과를 본다 [AC-PX-11]
          const [product] = await tx.$queryRaw<{ sellerId: string; status: string; deletedAt: Date | null }[]>`
            SELECT "sellerId", "status"::text AS "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR SHARE`;
          if (product === undefined || product.deletedAt !== null) throw new AppError('NOT_FOUND');
          if (product.sellerId === userId) throw new AppError('CANNOT_CHAT_OWN_PRODUCT');

          const existing = await tx.chatRoom.findUnique({
            where: { productId_buyerId: { productId, buyerId: userId } },
            select: { id: true },
          });
          if (existing !== null) return { id: existing.id, created: false };
          // 끝난 거래에 새 대화는 열 수 없다. 대화하던 사람은 위에서 이미 돌아갔다
          if (product.status === 'SOLD') throw new AppError('PRODUCT_SOLD');

          const room = await tx.chatRoom.create({
            data: {
              productId,
              sellerId: product.sellerId,
              buyerId: userId,
              members: {
                create: [
                  { userId: product.sellerId, role: 'SELLER' },
                  { userId, role: 'BUYER' },
                ],
              },
            },
            select: { id: true },
          });
          return { id: room.id, created: true };
        });
      } catch (err) {
        // 동시에 누른 두 요청 중 늦은 쪽 — 오류 난 트랜잭션은 버리고 새 쿼리로 읽는다 (S-07)
        if (uniqueViolationIndex(err) !== 'ChatRoom_productId_buyerId_key') throw err;
        const id = await existingId();
        if (id === null) throw err;
        result = { id, created: false };
      }
      return { room: await detail(userId, result.id), created: result.created };
    },

    // 최근 활동순. 삭제된 상품의 방도 포함한다 [AC-CL-01, 07, 08]
    async list(userId: string, query: ListChatRoomsQuery) {
      const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
      const rows = await all.chatRoomMember.findMany({
        where: {
          userId,
          ...(query.productId === undefined ? {} : { room: { productId: query.productId } }),
          ...(cursor === null
            ? {}
            : { OR: [{ lastActivityAt: { lt: cursor.at } }, { lastActivityAt: cursor.at, roomId: { lt: cursor.id } }] }),
        },
        orderBy: [{ lastActivityAt: 'desc' }, { roomId: 'desc' }],
        take: query.limit + 1,
        include: { room: { include: roomInclude } },
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeCursor({ at: last.lastActivityAt, id: last.roomId })
            : null,
      };
    },

    // 과거 방향 — 한 페이지 안은 최신이 앞 [AC-CH-10, 11]
    async messages(userId: string, roomId: string, query: ListMessagesQuery) {
      await assertMember(userId, roomId);
      const before = query.before === undefined ? null : decodeSeqCursor(query.before);
      const rows = await db.message.findMany({
        where: { roomId, ...(before === null ? {} : { seq: { lt: before } }) },
        orderBy: { seq: 'desc' },
        take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > query.limit && last !== undefined ? encodeSeqCursor(last.seq) : null,
      };
    },

    // 재연결 누락분 — after 뒤의 메시지를 오래된 순으로 최대 100개 [AC-CH-05]
    // 호출하는 쪽이 참여자인지 먼저 확인한다
    async missedSince(roomId: string, after: number) {
      const rows = await db.message.findMany({
        where: { roomId, seq: { gt: after } },
        orderBy: { seq: 'asc' },
        take: MISSED_MAX + 1,
      });
      return { missed: rows.slice(0, MISSED_MAX).map(toMessage), hasMore: rows.length > MISSED_MAX };
    },

    // T7 — 같은 tempId의 재전송은 처음 저장한 메시지를 돌려준다 [AC-CH-03, 04, 06]
    async send(userId: string, input: MessageSendInput, originConnectionId: string | null = null): Promise<Message> {
      const { roomId, tempId, content } = input;
      const findSent = () =>
        db.message.findUnique({ where: { roomId_senderId_tempId: { roomId, senderId: userId, tempId } } });

      let saved;
      try {
        saved = await db.$transaction(async (tx) => {
          // ① 참여자 확인
          const members = await tx.chatRoomMember.findMany({
            where: { roomId },
            include: { user: true, room: { select: { productId: true } } },
          });
          const me = members.find((member) => member.userId === userId);
          const partner = members.find((member) => member.userId !== userId);
          if (me === undefined || partner === undefined) throw new AppError('FORBIDDEN');

          // ② 진행 중인 삭제가 있으면 기다렸다가 삭제된 결과를 본다. 메시지끼리는 서로 막지 않는다 (FOR SHARE)
          const [product] = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
            SELECT "deletedAt" FROM "Product" WHERE "id" = ${me.room.productId} FOR SHARE`;
          if (product === undefined || product.deletedAt !== null) throw new ProductDeletedError();

          // ③ 방 행을 잠가 같은 방의 저장을 한 줄로 세운다 — 번호 순서 = 커밋 순서 (결정 0016)
          await tx.$queryRaw`SELECT 1 FROM "ChatRoom" WHERE "id" = ${roomId} FOR UPDATE`;

          // ④ 이미 저장한 전송이면 그대로 돌려준다
          const sent = await tx.message.findUnique({
            where: { roomId_senderId_tempId: { roomId, senderId: userId, tempId } },
          });
          if (sent !== null) return { message: sent, sender: me.user, receiverId: partner.userId, created: false };

          // 잠금을 얻은 뒤의 시각을 쓴다 — 기다리는 동안 흐른 시간만큼 목록 정렬이 어긋나지 않게
          const now = new Date();
          // ⑤ 번호를 올리고 목록용 복사본을 갱신한다. 롤백되면 번호도 함께 돌아가 구멍이 생기지 않는다
          const [room] = await tx.$queryRaw<{ lastSeq: number }[]>`
            UPDATE "ChatRoom"
            SET "lastSeq" = "lastSeq" + 1, "lastMessageAt" = ${now}, "lastMessagePreview" = ${toPreview(content)},
                "lastMessageSenderId" = ${userId}
            WHERE "id" = ${roomId}
            RETURNING "lastSeq"`;
          if (room === undefined) throw new AppError('FORBIDDEN');

          // ⑥ 메시지
          const message = await tx.message.create({
            data: { roomId, senderId: userId, seq: room.lastSeq, content, tempId, createdAt: now },
          });
          // ⑦ 두 사람의 목록에서 이 방이 맨 위로
          await tx.chatRoomMember.updateMany({ where: { roomId }, data: { lastActivityAt: now } });
          // ⑧ 보낸 사람은 여기까지 읽은 것이다
          await tx.chatRoomMember.update({
            where: { roomId_userId: { roomId, userId } },
            data: { lastReadSeq: room.lastSeq },
          });
          return { message, sender: me.user, receiverId: partner.userId, created: true };
        });
      } catch (err) {
        if (uniqueViolationIndex(err) !== 'Message_roomId_senderId_tempId_key') throw err;
        const sent = await findSent();
        if (sent === null) throw err;
        return toMessage(sent);
      }

      const message = toMessage(saved.message);
      // 재전송은 이미 알린 메시지다. 그때 알림이 닿지 않았어도 재연결 복구가 메운다
      if (!saved.created) return message;

      // 여기부터는 커밋 뒤 — 실패해도 메시지는 저장돼 있다 [AC-CH-44]
      const [total, count] = await Promise.all([
        unreadRooms(saved.receiverId),
        db.message.count({
          where: {
            roomId,
            senderId: userId,
            seq: { lte: saved.message.seq },
            createdAt: { gt: new Date(saved.message.createdAt.getTime() - BURST_WINDOW_MS) },
          },
        }),
      ]);
      const unread: NotificationUnreadEvent = {
        total,
        latest: {
          roomId,
          partner: toUserPublic(saved.sender),
          preview: toPreview(content),
          count: Math.max(1, count),
          createdAt: message.createdAt,
        },
      };
      realtime.messageCreated({ message, receiverId: saved.receiverId, unread, originConnectionId });
      return message;
    },

    // T8 — 뒤로 가지 않고(GREATEST), 없는 번호를 앞질러 찍지 않는다(LEAST) [AC-CH-01]
    async markRead(userId: string, roomId: string, seq: number): Promise<number> {
      const rows = await db.$queryRaw<{ lastReadSeq: number }[]>`
        UPDATE "ChatRoomMember" m
        SET "lastReadSeq" = GREATEST(m."lastReadSeq", LEAST(${seq}::int, r."lastSeq"))
        FROM "ChatRoom" r
        WHERE r."id" = m."roomId" AND m."roomId" = ${roomId} AND m."userId" = ${userId}
        RETURNING m."lastReadSeq"`;
      const row = rows[0];
      if (row === undefined) throw new AppError('NOT_FOUND');
      realtime.roomRead({ roomId, userId, lastReadSeq: row.lastReadSeq, unreadRooms: await unreadRooms(userId) });
      return row.lastReadSeq;
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;

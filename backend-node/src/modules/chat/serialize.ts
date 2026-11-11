import type { ChatRoomDetail, ChatRoomItem, Message, ProductSummary } from '@neighbo/shared-schema';
import type {
  ChatRoom,
  ChatRoomMember,
  Message as MessageRow,
  Product,
  ProductImage,
  User,
} from '../../generated/prisma/client.js';
import { toUserPublic } from '../auth/serialize.js';
import { toThumbnail } from '../products/serialize.js';

export type SummaryRow = Product & { images: ProductImage[] };

// 삭제된 상품도 요약은 보여 준다 — 방은 열람할 수 있어야 한다 [결정 0006]
export function toProductSummary(product: SummaryRow): ProductSummary {
  const cover = product.images[0];
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    status: product.status,
    thumbnail: cover === undefined ? null : toThumbnail(cover),
    deleted: product.deletedAt !== null,
  };
}

export function toMessage(message: MessageRow): Message {
  return {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    seq: message.seq,
    content: message.content,
    tempId: message.tempId,
    createdAt: message.createdAt.toISOString(),
  };
}

export type RoomRow = ChatRoom & { product: SummaryRow; seller: User; buyer: User };

// 방에서 나와 상대를 가른다 [CL-DT-23]
function sides(room: RoomRow, userId: string) {
  const amSeller = room.sellerId === userId;
  return { myRole: amSeller ? ('SELLER' as const) : ('BUYER' as const), partner: amSeller ? room.buyer : room.seller };
}

export function toChatRoomDetail(room: RoomRow & { members: ChatRoomMember[] }, userId: string): ChatRoomDetail {
  const { myRole, partner } = sides(room, userId);
  return {
    id: room.id,
    product: toProductSummary(room.product),
    partner: toUserPublic(partner),
    myRole,
    partnerLastReadSeq: room.members.find((member) => member.userId === partner.id)?.lastReadSeq ?? 0,
    createdAt: room.createdAt.toISOString(),
  };
}

export function toChatRoomItem(member: ChatRoomMember & { room: RoomRow }): ChatRoomItem {
  const { room } = member;
  const { myRole, partner } = sides(room, member.userId);
  return {
    id: room.id,
    product: toProductSummary(room.product),
    partner: toUserPublic(partner),
    myRole,
    lastMessage:
      room.lastMessageAt === null || room.lastMessagePreview === null || room.lastMessageSenderId === null
        ? null
        : {
            content: room.lastMessagePreview,
            senderId: room.lastMessageSenderId,
            createdAt: room.lastMessageAt.toISOString(),
          },
    // 내 메시지는 저장할 때 내 lastReadSeq를 함께 올리므로, 그 뒤 번호는 전부 상대 메시지다 [AC-NT-02]
    unreadCount: Math.max(0, room.lastSeq - member.lastReadSeq),
    lastActivityAt: member.lastActivityAt.toISOString(),
  };
}

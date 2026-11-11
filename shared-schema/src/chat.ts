import { z } from 'zod';
import { countCodePoints, countGraphemes, normalizeText } from './normalize';
import { imageSchema, productStatusSchema } from './product';
import { userPublicSchema } from './user';

// 근거: docs/architecture/backend.md 10 API 명세 2절 공유 타입 · 6절 채팅 · 9절 소켓 이벤트

export const memberRoleSchema = z.enum(['SELLER', 'BUYER']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

// 채팅방 · 채팅 목록 안의 상품 요약 — 삭제된 상품도 담는다 [결정 0006]
export const productSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number().int().min(0),
  status: productStatusSchema,
  thumbnail: imageSchema.nullable(),
  deleted: z.boolean(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const messageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  senderId: z.string(),
  // 방 안 순서 — 정렬 · 커서 · 읽음 · 틈 감지의 기준 [결정 0016]
  seq: z.number().int().positive(),
  content: z.string(),
  // 보낸 클라이언트가 만든 값 — 중복 제거용
  tempId: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

// 채팅 목록 행 [AC-CL-02, 14]
export const chatRoomItemSchema = z.object({
  id: z.string(),
  product: productSummarySchema,
  partner: userPublicSchema,
  myRole: memberRoleSchema,
  lastMessage: z.object({ content: z.string(), senderId: z.string(), createdAt: z.iso.datetime() }).nullable(),
  unreadCount: z.number().int().min(0),
  lastActivityAt: z.iso.datetime(),
});
export type ChatRoomItem = z.infer<typeof chatRoomItemSchema>;

// 채팅방 [AC-CH-10]
export const chatRoomDetailSchema = z.object({
  id: z.string(),
  product: productSummarySchema,
  partner: userPublicSchema,
  myRole: memberRoleSchema,
  // 내 메시지의 seq 이상이면 "읽음" [AC-CH-02]
  partnerLastReadSeq: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type ChatRoomDetail = z.infer<typeof chatRoomDetailSchema>;

export const chatRoomResponseSchema = z.object({ chatRoom: chatRoomDetailSchema });
export type ChatRoomResponse = z.infer<typeof chatRoomResponseSchema>;

export const chatRoomPageSchema = z.object({ items: z.array(chatRoomItemSchema), nextCursor: z.string().nullable() });
export type ChatRoomPage = z.infer<typeof chatRoomPageSchema>;

// 한 페이지 안은 seq DESC — 화면은 뒤집어 그린다
export const messagePageSchema = z.object({ items: z.array(messageSchema), nextCursor: z.string().nullable() });
export type MessagePage = z.infer<typeof messagePageSchema>;

export const readResponseSchema = z.object({ lastReadSeq: z.number().int().min(0) });
export type ReadResponse = z.infer<typeof readResponseSchema>;

// GET /me/unread — 읽지 않은 메시지가 있는 방의 수 [AC-NT-01, 결정 0008]
export const unreadResponseSchema = z.object({ rooms: z.number().int().min(0) });
export type UnreadResponse = z.infer<typeof unreadResponseSchema>;

// GET /auth/socket-token — 60초짜리 연결 전용 토큰 [AC-LI-18a]
export const socketTokenResponseSchema = z.object({ token: z.string(), expiresAt: z.iso.datetime() });
export type SocketTokenResponse = z.infer<typeof socketTokenResponseSchema>;

// ── 입력 ─────────────────────────────────────────────

const idField = z.string().min(1).max(64);
// 방 안 번호. 0 = 아직 아무것도 받지 않음
const seqField = z.number().int().min(0).max(2_147_483_647);

export const MESSAGE_MAX = 1000;
// 카운터를 보여 주기 시작하는 길이 [AC-CH-13]
export const MESSAGE_COUNTER_FROM = 900;

// 결합 문자를 수십 개씩 쌓으면 1,000자 안에서도 끝없이 길어진다 — DB CHECK(char_length <= 16000)와 같은 값
export const MESSAGE_MAX_CODE_POINTS = 16_000;

// 보낼 수 있으면 null, 아니면 이유. 입력은 normalizeMessage()를 거친 값
export function checkMessage(content: string): string | null {
  if (content === '') return '메시지를 입력해 주세요';
  if (countGraphemes(content) > MESSAGE_MAX) return '1,000자까지 보낼 수 있어요';
  return countCodePoints(content) > MESSAGE_MAX_CODE_POINTS ? '메시지가 너무 길어요' : null;
}

// 앞뒤 공백 · 끝 줄바꿈 제거, 빈 줄은 한 줄까지 [CH-IN-03, 04]
export function normalizeMessage(input: string): string {
  return normalizeText(input, { multiline: true });
}

const contentField = z
  .string()
  .transform(normalizeMessage)
  .superRefine((value, ctx) => {
    const message = checkMessage(value);
    if (message !== null) ctx.addIssue({ code: 'custom', message });
  });

// POST /chat-rooms [AC-PD-12~16]
export const openChatRoomSchema = z.object({ productId: idField });
export type OpenChatRoomInput = z.infer<typeof openChatRoomSchema>;

export const CHAT_LIST_LIMIT_DEFAULT = 30;
export const CHAT_LIST_LIMIT_MAX = 50;

// 넘치면 거부하지 않고 상한으로 맞춘다 — 상품 목록과 같은 규칙
function limitField(fallback: number, max: number) {
  return z.coerce
    .number()
    .int()
    .min(1)
    .catch(fallback)
    .default(fallback)
    .transform((value) => Math.min(value, max));
}

// GET /chat-rooms [AC-CL-01, 07]
export const listChatRoomsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: limitField(CHAT_LIST_LIMIT_DEFAULT, CHAT_LIST_LIMIT_MAX),
  productId: idField.optional(),
});
export type ListChatRoomsQuery = z.infer<typeof listChatRoomsQuerySchema>;

export const MESSAGE_PAGE_DEFAULT = 50;
export const MESSAGE_PAGE_MAX = 100;

// GET /chat-rooms/:id/messages — 과거 방향 [AC-CH-10, 11]
export const listMessagesQuerySchema = z.object({
  before: z.string().min(1).optional(),
  limit: limitField(MESSAGE_PAGE_DEFAULT, MESSAGE_PAGE_MAX),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// POST /chat-rooms/:id/read — 화면에 그린 마지막 메시지 번호 [AC-CH-01]
export const readSchema = z.object({ seq: seqField });
export type ReadInput = z.infer<typeof readSchema>;

// ── 소켓 ─────────────────────────────────────────────

export const SOCKET_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PRODUCT_DELETED',
  'INVALID_PAYLOAD',
  'RATE_LIMITED',
  // 예상하지 못한 서버 오류 — 같은 tempId로 다시 보내면 된다
  'INTERNAL',
] as const;
export type SocketErrorCode = (typeof SOCKET_ERROR_CODES)[number];

export const SOCKET_ERROR_MESSAGE: Record<SocketErrorCode, string> = {
  UNAUTHORIZED: '로그인이 필요해요',
  FORBIDDEN: '권한이 없어요',
  PRODUCT_DELETED: '삭제된 물건이라 메시지를 보낼 수 없어요',
  INVALID_PAYLOAD: '잘못된 요청이에요',
  RATE_LIMITED: '잠시 후 다시 시도해 주세요',
  INTERNAL: '일시적인 문제가 생겼어요',
};

// 재연결 누락분은 한 번에 100개까지, 넘치면 HTTP로 [AC-CH-05]
export const MISSED_MAX = 100;
// message:send는 항상 이 시간 안에 ack를 기다린다 [AC-CH-37]
export const SEND_ACK_TIMEOUT_MS = 5000;

export const roomJoinSchema = z.object({
  roomId: idField,
  // 마지막으로 받은 seq. null이면 누락분을 묻지 않는다
  after: seqField.nullable().default(null),
});
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;

export const roomLeaveSchema = z.object({ roomId: idField });

export const messageSendSchema = z.object({
  roomId: idField,
  tempId: z.string().min(1).max(64),
  content: contentField,
});
export type MessageSendInput = z.infer<typeof messageSendSchema>;

export const roomReadSchema = z.object({ roomId: idField, seq: seqField });
export type RoomReadInput = z.infer<typeof roomReadSchema>;

export type RoomJoinAck = { ok: true; missed: Message[]; hasMore: boolean } | { ok: false; code: SocketErrorCode };
export type MessageSendAck =
  | { ok: true; message: Message }
  | { ok: false; code: SocketErrorCode; retryAfterMs: number | null };

export interface RoomReadEvent {
  roomId: string;
  userId: string;
  lastReadSeq: number;
}

// 배지 숫자 + 토스트용 최신 메시지 요약 [AC-NT-01, 05]
export const notificationUnreadSchema = z.object({
  total: z.number().int().min(0),
  latest: z
    .object({
      roomId: z.string(),
      partner: userPublicSchema,
      preview: z.string(),
      // 같은 방 5초 안에 온 메시지 수 [AC-NT-06]
      count: z.number().int().positive(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
});
export type NotificationUnreadEvent = z.infer<typeof notificationUnreadSchema>;

export interface RoomProductUpdatedEvent {
  roomId: string;
  product: ProductSummary;
}

// 이벤트 이름과 페이로드를 프론트와 서버가 같이 쓴다 [AC-CH-34]
export interface ClientToServerEvents {
  'room:join': (payload: unknown, ack: (result: RoomJoinAck) => void) => void;
  'room:leave': (payload: unknown) => void;
  'message:send': (payload: unknown, ack: (result: MessageSendAck) => void) => void;
  'room:read': (payload: unknown) => void;
}

export interface ServerToClientEvents {
  'message:new': (payload: { message: Message }) => void;
  'room:read': (payload: RoomReadEvent) => void;
  'notification:unread': (payload: NotificationUnreadEvent) => void;
  'room:product_updated': (payload: RoomProductUpdatedEvent) => void;
  error: (payload: { code: SocketErrorCode; message: string }) => void;
}

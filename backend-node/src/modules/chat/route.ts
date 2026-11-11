import { Router, type RequestHandler } from 'express';
import {
  listChatRoomsQuerySchema,
  listMessagesQuerySchema,
  openChatRoomSchema,
  readSchema,
  type ChatRoomPage,
  type ChatRoomResponse,
  type MessagePage,
  type ReadResponse,
} from '@neighbo/shared-schema';
import { currentUser, type Session } from '../../middleware/auth.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { toChatRoomDetail, toChatRoomItem, toMessage } from './serialize.js';
import type { ChatService } from './service.js';

interface ChatRouteDeps {
  service: ChatService;
  session: Session;
  // 사용자 분당 30 — 엔드포인트마다 따로 센다 [AC-CM-32]
  writeLimit: (name: string) => RequestHandler;
}

// 메시지 전송은 여기 없다 — 소켓 message:send 하나뿐이다 [AC-CH-03]
export function createChatRouter({ service, session, writeLimit }: ChatRouteDeps): Router {
  const router = Router();
  // 채팅은 전부 로그인이 필요하다. 응답은 사람마다 달라 캐시하지 않는다 (requireAuth가 no-store를 붙인다)
  router.use(session.requireAuth);

  router.post('/', writeLimit('chat-room-open'), async (req, res) => {
    const user = currentUser(res);
    const { productId } = parseOrThrow(openChatRoomSchema, req.body);
    const { room, created } = await service.open(user.id, productId);
    const body: ChatRoomResponse = { chatRoom: toChatRoomDetail(room, user.id) };
    res.status(created ? 201 : 200).json(body);
  });

  router.get('/', async (req, res) => {
    const page = await service.list(currentUser(res).id, parseOrThrow(listChatRoomsQuerySchema, req.query));
    const body: ChatRoomPage = { items: page.items.map(toChatRoomItem), nextCursor: page.nextCursor };
    res.json(body);
  });

  router.get('/:id', async (req, res) => {
    const user = currentUser(res);
    const body: ChatRoomResponse = { chatRoom: toChatRoomDetail(await service.detail(user.id, String(req.params.id)), user.id) };
    res.json(body);
  });

  router.get('/:id/messages', async (req, res) => {
    const page = await service.messages(
      currentUser(res).id,
      String(req.params.id),
      parseOrThrow(listMessagesQuerySchema, req.query),
    );
    const body: MessagePage = { items: page.items.map(toMessage), nextCursor: page.nextCursor };
    res.json(body);
  });

  // 소켓이 없을 때의 읽음 [AC-CH-01]
  router.post('/:id/read', writeLimit('chat-read'), async (req, res) => {
    const { seq } = parseOrThrow(readSchema, req.body);
    const body: ReadResponse = { lastReadSeq: await service.markRead(currentUser(res).id, String(req.params.id), seq) };
    res.json(body);
  });

  return router;
}

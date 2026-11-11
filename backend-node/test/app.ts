import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { createLogger } from '../src/lib/log.js';
import { createPasswordHasher } from '../src/lib/password.js';
import { createChatService } from '../src/modules/chat/service.js';
import type { Realtime } from '../src/realtime/Realtime.js';
import { createLocalStorage } from '../src/storage/ImageStorage.js';
import { TEST_DATABASE_URL, testConfig } from './env.js';

// 통합 테스트용 앱 — 진짜 PostgreSQL, 진짜 bcrypt(가장 낮은 비용)
export const db = createDb(TEST_DATABASE_URL);
const hasher = await createPasswordHasher(10);

export const storage = createLocalStorage('.data/test-uploads', '/files');

export const ORIGIN = 'http://localhost:3000';

export function createTestApp(options: { pingDb?: () => Promise<void>; env?: Record<string, string> } = {}) {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger('info', (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const config = testConfig(options.env);
  // 커밋 뒤에 무엇을 알렸는지 기록한다 — 소켓 없이 서비스의 알림을 확인한다
  const events: { [K in keyof Realtime]: Parameters<Realtime[K]>[0][] } = {
    messageCreated: [],
    roomRead: [],
    productUpdated: [],
  };
  const realtime: Realtime = {
    messageCreated: (event) => void events.messageCreated.push(event),
    roomRead: (event) => void events.roomRead.push(event),
    productUpdated: (event) => void events.productUpdated.push(event),
  };
  const chat = createChatService(db, realtime);
  const app = createApp({
    config,
    log,
    db,
    hasher,
    storage,
    chat,
    pingDb: options.pingDb ?? (() => Promise.resolve()),
  });
  return { app, lines, config, chat, events };
}

export async function resetDb() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Message", "ChatRoomMember", "ChatRoom", "ProductImage", "Upload", "Product", "User" CASCADE',
  );
}

// 쓰기 요청은 허용된 Origin과 함께 보낸다
export function post(app: Parameters<typeof request>[0], path: string) {
  return request(app).post(path).set('Origin', ORIGIN);
}

export function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const cookies = (res.headers['set-cookie'] ?? []) as string[];
  const cookie = cookies.find((c) => c.startsWith('nb_session='));
  if (cookie === undefined) throw new Error('세션 쿠키가 없다');
  return cookie.split(';')[0] ?? '';
}

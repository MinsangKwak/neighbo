import { createServer, type RequestListener } from 'node:http';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createLogger } from './lib/log.js';
import { createPasswordHasher } from './lib/password.js';
import { createChatService } from './modules/chat/service.js';
import { createOriginCheck } from './middleware/origin.js';
import { createSocketHub } from './realtime/socketHub.js';
import { createStorage } from './storage/index.js';

function boot() {
  try {
    // 코드에서 process.env를 읽는 곳은 여기 한 줄뿐이다
    // eslint-disable-next-line no-restricted-properties
    return loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      // 이름과 이유만 출력한다 — 값은 찍지 않는다
      createLogger('error').error('boot', { problems: err.problems });
      process.exit(1);
    }
    throw err;
  }
}

const config = boot();
const log = createLogger(config.LOG_LEVEL);
const db = createDb(config.DATABASE_URL);

const hasher = await createPasswordHasher(config.BCRYPT_COST);

// HTTP와 소켓이 한 서버 · 한 포트를 쓴다. 소켓은 /socket.io 경로를 스스로 받고 나머지를 이 처리기로 넘긴다
// 처리기는 서버를 만들 때 넣어야 한다 — Socket.IO가 붙은 뒤에 더한 처리기는 소켓 요청에도 함께 불려 응답이 두 번 나간다 (I-12)
// 앱은 소켓 허브보다 나중에 조립되므로 자리만 먼저 잡아 둔다
let handleHttp: RequestListener = (_req, res) => {
  res.statusCode = 503;
  res.end();
};
const server = createServer((req, res) => handleHttp(req, res));
const hub = createSocketHub({
  httpServer: server,
  jwtSecret: config.JWT_SECRET,
  log,
  isAllowedOrigin: createOriginCheck(config.ALLOWED_ORIGIN, config.ALLOWED_ORIGIN_PATTERN),
  isCurrentUser: async (userId, tokenVersion) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, deletedAt: true } });
    return user !== null && user.deletedAt === null && user.tokenVersion === tokenVersion;
  },
});
// 서비스는 소켓을 모르고 Realtime만 안다. 소켓 이벤트는 HTTP와 같은 서비스 함수를 부른다
const chat = createChatService(db, hub.realtime);
hub.bind(chat);

const app = createApp({
  config,
  log,
  db,
  hasher,
  storage: createStorage(config),
  chat,
  realtime: hub.realtime,
  pingDb: async () => {
    await db.$queryRaw`SELECT 1`;
  },
});
handleHttp = app;

server.listen(config.PORT, () => {
  log.info('boot', { port: config.PORT, env: config.NODE_ENV });
});

// 배포 때 진행 중인 요청을 끝내고 내려간다
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log.info('boot', { shutdown: signal });
    // 소켓 연결을 끊고 진행 중인 HTTP 요청이 끝나면 닫힌다. 클라이언트는 새 인스턴스로 다시 붙는다 [AC-CH-36]
    void hub.close().finally(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
  });
}

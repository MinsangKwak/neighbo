import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createLogger } from './lib/log.js';
import { createPasswordHasher } from './lib/password.js';
import { createChatService } from './modules/chat/service.js';
import { silentRealtime } from './realtime/Realtime.js';
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

const app = createApp({
  config,
  log,
  db,
  hasher,
  storage: createStorage(config),
  // 소켓 서버가 붙기 전까지는 실시간 전달 없이 저장만 한다
  chat: createChatService(db, silentRealtime),
  pingDb: async () => {
    await db.$queryRaw`SELECT 1`;
  },
});

const server = app.listen(config.PORT, () => {
  log.info('boot', { port: config.PORT, env: config.NODE_ENV });
});

// 배포 때 진행 중인 요청을 끝내고 내려간다
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log.info('boot', { shutdown: signal });
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
  });
}

import { ConfigError, loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { createLogger } from '../lib/log.js';
import { createPasswordHasher } from '../lib/password.js';
import { seedDemoAccounts } from './demo.js';

// 시드 실행 — 배포 때는 마이그레이션 뒤, 서버 시작 전에 돈다
const log = createLogger('info');

try {
  // eslint-disable-next-line no-restricted-properties
  const config = loadConfig(process.env);
  if (config.DEMO_PASSWORD === undefined) {
    log.info('seed', { demo: 'skipped', reason: 'DEMO_PASSWORD가 없다' });
  } else {
    const db = createDb(config.DATABASE_URL);
    await seedDemoAccounts(db, await createPasswordHasher(config.BCRYPT_COST), config.DEMO_PASSWORD);
    await db.$disconnect();
    log.info('seed', { demo: 'done' });
  }
} catch (err) {
  if (err instanceof ConfigError) {
    log.error('seed', { problems: err.problems });
    process.exit(1);
  }
  throw err;
}

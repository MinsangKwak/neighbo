import { ConfigError, loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { createLogger } from '../lib/log.js';
import { createPasswordHasher } from '../lib/password.js';
import { createStorage } from '../storage/index.js';
import { DEMO_ACCOUNTS, seedDemoAccounts, seedDemoProducts } from './demo.js';
import { drawSeedImages } from './images.js';
import { removeSample, seedSample } from './sample.js';

// 시드 실행 — 배포 때는 마이그레이션 뒤, 서버 시작 전에 돈다
const log = createLogger('info');

try {
  // eslint-disable-next-line no-restricted-properties
  const config = loadConfig(process.env);
  if (config.DEMO_PASSWORD === undefined) {
    log.info('seed', { demo: 'skipped', reason: 'DEMO_PASSWORD가 없다' });
  } else {
    const db = createDb(config.DATABASE_URL);
    const report = await seedDemoAccounts(db, await createPasswordHasher(config.BCRYPT_COST), config.DEMO_PASSWORD);
    log.info('seed', { demo: 'done', seeded: report.seeded });
    if (report.conflicts.length > 0) {
      // 사람이 정리해야 한다 — 그 이메일 · 닉네임을 쓰는 기존 계정이 있다
      log.error('seed', { demo: 'conflict', accounts: report.conflicts });
    }

    // 상품과 방은 두 데모 계정에 붙는다 — 하나라도 못 만들었으면 넣지 않는다
    if (report.seeded.length === DEMO_ACCOUNTS.length) {
      const storage = createStorage(config);
      const images = await drawSeedImages(12);
      log.info('seed', { demoProducts: await seedDemoProducts(db, storage, images) });
      if (config.SEED_SAMPLE === '1') {
        const sample = await seedSample(db, storage, images);
        if (sample.skipped) log.error('seed', { sample: 'conflict' });
        else log.info('seed', { sample: 'done', ...sample });
      }
    }
    await db.$disconnect();
  }
  if (config.SEED_SAMPLE === 'remove') {
    const db = createDb(config.DATABASE_URL);
    log.info('seed', { sample: 'removed', ...(await removeSample(db, createStorage(config))) });
    await db.$disconnect();
  }
} catch (err) {
  if (err instanceof ConfigError) {
    log.error('seed', { problems: err.problems });
    process.exit(1);
  }
  throw err;
}

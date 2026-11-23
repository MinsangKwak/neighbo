import { defineConfig, devices } from '@playwright/test';

// 실제 브라우저로 두 서버를 띄워 핵심 흐름을 끝까지 돌린다
// 컴포넌트 테스트가 못 보는 것 — 공용 부품이 동작을 삼키는 일, 실제 폭에서의 배치, 쿠키와 소켓 — 을 여기서 잡는다
// 근거: docs/dev.md 테스트 전략, docs/troubleshooting.md I-16

const WEB = 'http://localhost:3100';
const API = 'http://localhost:4100';
// 마이그레이션이 적용된 빈 DB. CI는 워크플로가 prisma migrate deploy를 먼저 돌린다
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://neighbo:neighbo@127.0.0.1:5432/neighbo_e2e';

const serverEnv = {
  NODE_ENV: 'development',
  PORT: '4100',
  DATABASE_URL,
  JWT_SECRET: 'e2e-only-jwt-secret-0123456789-0123456789-01',
  PROXY_SECRET: 'e2e-only-proxy-secret-0123456789-0123456789',
  ALLOWED_ORIGIN: WEB,
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '.data/e2e-uploads',
  BCRYPT_COST: '10',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  // 두 계정이 같은 DB에서 차례로 움직인다 — 순서대로 돈다
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        // 로컬에 설치된 Chrome을 쓰려면 PW_CHANNEL=chrome
        ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: '../backend-node',
      url: `${API}/healthz`,
      env: serverEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // 운영과 같은 빌드로 돌린다 — 개발 서버의 오류 덮개가 화면을 가리지 않게
      command: 'npm run build && npm run start -- -p 3100',
      url: WEB,
      env: { API_URL: API, PROXY_SECRET: serverEnv.PROXY_SECRET },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});

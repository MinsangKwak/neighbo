import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../backend-node', import.meta.url)),
  test: {
    include: ['../docs/tests/backend-node/**/*.test.ts'],
    globalSetup: [fileURLToPath(new URL('./support/globalSetup.ts', import.meta.url))],
    // 통합 테스트가 같은 DB를 쓰므로 파일을 차례로 돌린다
    fileParallelism: false,
  },
});

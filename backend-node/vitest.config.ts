import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // 통합 테스트가 같은 DB를 쓰므로 파일을 차례로 돌린다
    fileParallelism: false,
  },
});

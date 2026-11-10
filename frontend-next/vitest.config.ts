import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 서버 전용 표시는 Next.js 번들러가 검사한다. 테스트에서는 빈 모듈로 바꾼다
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});

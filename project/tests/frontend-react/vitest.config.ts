import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../frontend-react', import.meta.url)),
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      'react': fileURLToPath(new URL('../../node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)),
      '@tanstack/react-query': fileURLToPath(new URL('../../node_modules/@tanstack/react-query', import.meta.url)),
      'socket.io-client': fileURLToPath(new URL('../../node_modules/socket.io-client', import.meta.url)),
      'next': fileURLToPath(new URL('../../node_modules/next', import.meta.url)),
      '@': fileURLToPath(new URL('../../../frontend-react/src', import.meta.url)),
      // 서버 전용 표시는 Next.js 번들러가 검사한다. 테스트에서는 빈 모듈로 바꾼다
      'server-only': fileURLToPath(new URL('./support/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['../project/tests/frontend-react/**/*.test.{ts,tsx}'],
    setupFiles: [fileURLToPath(new URL('./support/setup.ts', import.meta.url))],
  },
});

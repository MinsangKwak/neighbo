import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/docs/**/*.test.ts', 'src/modules/products/rate-limit.test.ts', 'src/realtime/socket-control-rate.test.ts'],
  },
});

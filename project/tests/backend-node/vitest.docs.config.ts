import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../backend-node', import.meta.url)),
  test: {
    include: ['../project/tests/backend-node/modules/api-docs/**/*.test.ts', '../project/tests/backend-node/modules/products/rate-limit.test.ts', '../project/tests/backend-node/realtime/socket-control-rate.test.ts'],
  },
});

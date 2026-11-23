import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../shared-schema', import.meta.url)),
  test: { include: ['../project/tests/shared-schema/**/*.test.ts'] },
});

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['tests/**/test-results/**', 'tests/**/playwright-report/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-properties': ['error', { object: 'process', property: 'env', message: '실행 환경은 검증된 config 또는 테스트 지원 모듈에서 읽는다.' }],
    },
  },
  { files: ['tests/frontend-react/playwright.config.ts'], rules: { 'no-restricted-properties': 'off' } },
);

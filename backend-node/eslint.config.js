import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['src/generated/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 환경 변수는 config.ts가 검증한 값만 쓴다 (backend.md 11절)
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'process.env 대신 검증된 config를 쓴다.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);

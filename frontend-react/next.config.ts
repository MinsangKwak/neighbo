import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { NEXT_SECURITY_HEADER_RULES } from './src/lib/securityHeaders';

const config: NextConfig = {
  turbopack: { root: fileURLToPath(new URL('..', import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  // 공유 스키마는 빌드하지 않은 TypeScript 소스 그대로 가져온다
  transpilePackages: ['@neighbo/shared-schema'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return NEXT_SECURITY_HEADER_RULES;
  },
};

export default config;

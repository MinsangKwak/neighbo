import type { NextConfig } from 'next';

const config: NextConfig = {
  // 공유 스키마는 빌드하지 않은 TypeScript 소스 그대로 가져온다
  transpilePackages: ['@neighbo/shared-schema'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;

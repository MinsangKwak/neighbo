import type { NextConfig } from 'next';
import { APP_SECURITY_HEADERS } from './src/lib/securityHeaders';

const config: NextConfig = {
  // 공유 스키마는 빌드하지 않은 TypeScript 소스 그대로 가져온다
  transpilePackages: ['@neighbo/shared-schema'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        // 공개 API 문서(/node-swagger · /node-openapi.json)는 docsProxy가 자기 CSP · Referrer-Policy를 붙인다
        // 설정의 헤더는 라우트가 정한 같은 이름의 헤더를 덮어써 Swagger의 script-src 'self'가 사라지므로 이 두 경로는 뺀다
        source: '/((?!node-swagger|node-openapi\\.json).*)',
        headers: APP_SECURITY_HEADERS,
      },
    ];
  },
};

export default config;

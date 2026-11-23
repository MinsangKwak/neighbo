// Next.js가 실행에 필요한 인라인 스크립트까지 막지 않고, 문서 자체의 권한만 제한한다.
// script-src nonce를 적용하지 않은 정책이므로 이 범위를 넘어선 전면 CSP로 설명하지 않는다.
export const APP_CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export const APP_PERMISSIONS_POLICY = [
  'camera=()',
  'geolocation=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

export interface SecurityHeader {
  key: string;
  value: string;
}

export const SWAGGER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const OPENAPI_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const APP_SECURITY_HEADERS: SecurityHeader[] = [
  { key: 'Content-Security-Policy', value: APP_CONTENT_SECURITY_POLICY },
  { key: 'Permissions-Policy', value: APP_PERMISSIONS_POLICY },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '0' },
];

const PUBLIC_DOCUMENT_HEADERS: SecurityHeader[] = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: APP_PERMISSIONS_POLICY },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

export const SWAGGER_SECURITY_HEADERS: SecurityHeader[] = [
  { key: 'Content-Security-Policy', value: SWAGGER_CONTENT_SECURITY_POLICY },
  ...PUBLIC_DOCUMENT_HEADERS,
];

export const OPENAPI_SECURITY_HEADERS: SecurityHeader[] = [
  { key: 'Content-Security-Policy', value: OPENAPI_CONTENT_SECURITY_POLICY },
  ...PUBLIC_DOCUMENT_HEADERS,
];

// Next.js는 여러 source가 맞으면 뒤 규칙의 같은 헤더 키를 사용한다.
// 앱 공통 규칙 뒤에 문서 전용 규칙을 두어 Route Handler의 강한 CSP가 전역 부분 CSP에 덮이지 않게 한다.
export const NEXT_SECURITY_HEADER_RULES: { source: string; headers: SecurityHeader[] }[] = [
  { source: '/:path*', headers: APP_SECURITY_HEADERS },
  { source: '/node-swagger/:path*', headers: SWAGGER_SECURITY_HEADERS },
  { source: '/node-openapi.json', headers: OPENAPI_SECURITY_HEADERS },
];

export function applySecurityHeaders(headers: Headers, values: readonly SecurityHeader[]): Headers {
  for (const { key, value } of values) headers.set(key, value);
  return headers;
}

export function applyAppSecurityHeaders(headers: Headers): Headers {
  return applySecurityHeaders(headers, APP_SECURITY_HEADERS);
}

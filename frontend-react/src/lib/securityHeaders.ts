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

export const APP_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: APP_CONTENT_SECURITY_POLICY },
  { key: 'Permissions-Policy', value: APP_PERMISSIONS_POLICY },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '0' },
];

export function applyAppSecurityHeaders(headers: Headers): Headers {
  for (const { key, value } of APP_SECURITY_HEADERS) headers.set(key, value);
  return headers;
}

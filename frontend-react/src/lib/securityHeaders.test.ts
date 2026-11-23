// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_PERMISSIONS_POLICY,
  APP_SECURITY_HEADERS,
  applyAppSecurityHeaders,
} from './securityHeaders';

describe('공통 브라우저 보안 헤더', () => {
  it('프레임 · 플러그인 · base URL · 외부 폼 제출을 제한한다', () => {
    expect(APP_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
    // nonce 없이 Next.js 인라인 실행 코드를 막는다고 과장하지 않는다.
    expect(APP_CONTENT_SECURITY_POLICY).not.toContain('script-src');
    expect(APP_CONTENT_SECURITY_POLICY).not.toContain("'unsafe-inline'");
  });

  it('사용하지 않는 브라우저 권한과 MIME 스니핑 · 외부 프레임을 닫는다', () => {
    expect(APP_PERMISSIONS_POLICY).toContain('camera=()');
    const headers = applyAppSecurityHeaders(new Headers());
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-XSS-Protection')).toBe('0');
    expect(APP_SECURITY_HEADERS).toHaveLength(7);
  });
});

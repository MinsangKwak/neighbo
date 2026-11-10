import { describe, expect, it } from 'vitest';
import { loginHref, safeNext } from './next';

describe('safeNext', () => {
  it('[AC-CM-01] 같은 오리진의 경로는 그대로 돌려준다', () => {
    expect(safeNext('/products/new')).toBe('/products/new');
    expect(safeNext('/chats?productId=p1')).toBe('/chats?productId=p1');
  });

  it('[AC-LI-10] 외부 주소 · 로그인 · 가입 화면이면 홈으로 보낸다', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(next)).toBe('/');
    }
    expect(safeNext('/login')).toBe('/');
    expect(safeNext('/signup?next=/me')).toBe('/');
  });

  it('로그인 주소에 돌아갈 곳을 인코딩해 싣는다', () => {
    expect(loginHref('/chats?productId=p1')).toBe('/login?next=%2Fchats%3FproductId%3Dp1');
  });
});

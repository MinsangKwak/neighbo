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
    // 브라우저가 탭 · 줄바꿈을 지우고 \\를 /로 바꿔 다른 오리진으로 해석하는 값들
    for (const next of ['/\t/evil.example', '/\n/evil.example', '/\t\\evil.example', '/\\/evil.example', '/%09/evil.example']) {
      const result = safeNext(next);
      expect(new URL(result, 'https://neighbo.test').origin).toBe('https://neighbo.test');
    }
    expect(safeNext('/\t/evil.example')).toBe('/');
    expect(safeNext('/login')).toBe('/');
    expect(safeNext('/signup?next=/me')).toBe('/');
  });

  it('로그인 주소에 돌아갈 곳을 인코딩해 싣는다', () => {
    expect(loginHref('/chats?productId=p1')).toBe('/login?next=%2Fchats%3FproductId%3Dp1');
  });
});

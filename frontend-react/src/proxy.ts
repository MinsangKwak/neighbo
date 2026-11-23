import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@neighbo/shared-schema';

// 보호 경로의 1겹 — 세션 쿠키가 "있는가"만 본다
// 토큰이 유효한지는 여기서 알 수 없다(tokenVersion은 DB에 있다). 진짜 판단은 페이지의 2겹이 한다
const PROTECTED = [/^\/me(\/|$)/, /^\/chats(\/|$)/, /^\/products\/new$/, /^\/products\/[^/]+\/edit$/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = (request.cookies.get(SESSION_COOKIE)?.value ?? '') !== '';

  if (!hasSession && PROTECTED.some((pattern) => pattern.test(pathname))) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  // 로그아웃 후 뒤로가기로 보호 화면이 보이지 않게 [AC-LI-13]
  if (PROTECTED.some((pattern) => pattern.test(pathname))) {
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
}

export const config = {
  matcher: ['/me/:path*', '/chats/:path*', '/products/:path*'],
};

// 로그인 후 돌아갈 곳 — 같은 오리진의 경로만 허용한다 [AC-CM-01, AC-LI-10]
// 접두어만 보면 뚫린다: 브라우저의 URL 해석은 탭 · 줄바꿈을 지우고 \를 /로 바꾸므로
// "/\t/evil.example"은 "//evil.example"(다른 오리진)이 된다. 그래서 브라우저와 같은 방식으로
// 해석한 결과의 오리진을 확인하고, 해석된 경로만 돌려준다
const BASE = 'http://same-origin.invalid';

export function safeNext(next: string | null | undefined): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return '/';
  }
  if (url.origin !== BASE) return '/';
  if (url.pathname === '/login' || url.pathname === '/signup') return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

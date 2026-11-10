// 로그인 후 돌아갈 곳 — 같은 오리진의 경로만 허용한다 [AC-CM-01, AC-LI-10]
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  // "//evil.example" · "/\evil.example"은 다른 오리진으로 해석된다
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  const path = next.split(/[?#]/)[0] ?? '';
  if (path === '/login' || path === '/signup') return '/';
  return next;
}

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

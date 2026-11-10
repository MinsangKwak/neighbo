// 탭 사이에 로그인 · 로그아웃을 알린다 — storage 이벤트는 다른 탭에서만 발생한다
const KEY = 'nb:auth-event';

type AuthEvent = { type: 'logout' } | { type: 'login'; userId: string };

function announce(event: AuthEvent) {
  try {
    // 같은 값이면 이벤트가 생기지 않으므로 시각을 붙인다
    localStorage.setItem(KEY, JSON.stringify({ ...event, at: Date.now() }));
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 탭 사이 알림만 빠진다
  }
}

export const announceLogout = () => announce({ type: 'logout' });
export const announceLogin = (userId: string) => announce({ type: 'login', userId });

export function onAuthEvent(handler: (event: AuthEvent) => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key !== KEY || event.newValue === null) return;
    try {
      handler(JSON.parse(event.newValue) as AuthEvent);
    } catch {
      // 모양이 다른 값은 무시한다
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

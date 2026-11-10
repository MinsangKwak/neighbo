// 표시 규칙은 이 파일의 함수 하나씩으로 — 화면마다 다르게 보이지 않게

// 천 단위 콤마 + "원", 0원은 "나눔" [AC-CM-51]
export function formatPrice(price: number): string {
  return price === 0 ? '나눔' : `${price.toLocaleString('ko-KR')}원`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// 방금 전 · N분 전 · N시간 전 · N일 전 · M월 D일 · YYYY년 M월 D일 [AC-CM-50]
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  // 시계가 어긋나 미래로 보이는 시각도 "방금 전"으로
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return '방금 전';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}일 전`;
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear() ? monthDay : `${date.getFullYear()}년 ${monthDay}`;
}

// 스크린리더 · 툴팁용 전체 시각
export function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
}

// 0이면 숨기고 100 이상은 99+ [AC-PL-11]
export function formatCount(count: number): string | null {
  if (count <= 0) return null;
  return count >= 100 ? '99+' : String(count);
}

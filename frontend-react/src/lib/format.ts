// 표시 규칙은 이 파일의 함수 하나씩으로 — 화면마다 다르게 보이지 않게

// 천 단위 콤마 + "원", 0원은 "나눔" [AC-CM-51]
// "2026년 11월부터" — 가입한 달. 서버와 브라우저가 같은 글자를 내도록 UTC로 센다
export function formatJoinedMonth(iso: string): string {
  const joined = new Date(iso);
  return `${joined.getUTCFullYear()}년 ${joined.getUTCMonth() + 1}월부터`;
}

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

// ── 채팅 ─────────────────────────────────────────────

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// 말풍선 옆 시각 — "오후 3:24"
export function formatClock(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours < 12 ? '오전' : '오후'} ${hours % 12 === 0 ? 12 : hours % 12}:${minutes}`;
}

// 채팅 목록의 시각 — 오늘은 시각, 어제는 "어제", 7일 미만은 "N일 전", 그 이상은 "M월 D일" [AC-CL-12]
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  // 달력 날짜로 센다 — 23시간 전이어도 날짜가 바뀌었으면 "어제"다
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return formatClock(iso);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear() ? monthDay : `${date.getFullYear()}년 ${monthDay}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 날짜 구분선 — "2026년 11월 9일 (일)" [AC-CH-15]
export function formatDateLine(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

// 같은 분 — 연속 메시지의 시각을 마지막에만 보이는 기준 [AC-CH-15]
export function isSameMinute(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / MINUTE) === Math.floor(new Date(b).getTime() / MINUTE);
}

import { describe, expect, it } from 'vitest';
import { formatCount, formatPrice, formatRelativeTime } from './format';

describe('표시 형식', () => {
  it('[AC-CM-51] 금액은 천 단위 콤마 + 원, 0원은 나눔', () => {
    expect(formatPrice(0)).toBe('나눔');
    expect(formatPrice(15000)).toBe('15,000원');
    expect(formatPrice(100_000_000)).toBe('100,000,000원');
  });

  it('[AC-CM-50] 상대 시간 규칙', () => {
    const now = new Date('2026-11-11T12:00:00+09:00');
    const ago = (ms: number) => formatRelativeTime(new Date(now.getTime() - ms).toISOString(), now);
    expect(ago(30_000)).toBe('방금 전');
    expect(ago(-5_000)).toBe('방금 전');
    expect(ago(5 * 60_000)).toBe('5분 전');
    expect(ago(3 * 3_600_000)).toBe('3시간 전');
    expect(ago(2 * 86_400_000)).toBe('2일 전');
    expect(formatRelativeTime('2026-10-01T03:00:00.000Z', now)).toBe('10월 1일');
    expect(formatRelativeTime('2025-03-05T03:00:00.000Z', now)).toBe('2025년 3월 5일');
  });

  it('[AC-PL-11] 개수는 0이면 숨기고 100 이상은 99+', () => {
    expect(formatCount(0)).toBeNull();
    expect(formatCount(7)).toBe('7');
    expect(formatCount(100)).toBe('99+');
  });
});

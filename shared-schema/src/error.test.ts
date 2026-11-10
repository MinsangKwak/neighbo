import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, errorResponseSchema } from './error';
import { productCardSchema } from './product';

describe('에러 응답 스키마', () => {
  it('[AC-CM-10] code · message · fields 세 필드를 가진다', () => {
    const body = { error: { code: 'NOT_FOUND', message: '찾을 수 없어요', fields: null } };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('카탈로그에 없는 코드는 거부한다', () => {
    const body = { error: { code: 'WHATEVER', message: 'x', fields: null } };
    expect(errorResponseSchema.safeParse(body).success).toBe(false);
  });

  it('모든 코드는 4xx · 5xx 상태와 문구를 가진다', () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });
});

describe('목록 카드 스키마', () => {
  const card = {
    id: 'p1',
    title: '원목 의자',
    price: 0,
    status: 'ON_SALE',
    thumbnail: null,
    chatRoomCount: 0,
    createdAt: '2026-11-10T00:12:34.567Z',
  };

  it('[AC-CM-51] 가격 0원(나눔)을 받는다', () => {
    expect(productCardSchema.safeParse(card).success).toBe(true);
  });

  it('[AC-CM-51] 1억을 넘는 가격 · 소수 가격은 거부한다', () => {
    expect(productCardSchema.safeParse({ ...card, price: 100_000_001 }).success).toBe(false);
    expect(productCardSchema.safeParse({ ...card, price: 1.5 }).success).toBe(false);
  });
});

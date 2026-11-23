import { describe, expect, it } from 'vitest';
import { listPath, listQuery } from './api';

describe('listQuery', () => {
  it('조건이 없으면 개수만 보낸다', () => {
    expect(listQuery({ q: null, hideSold: false }, null)).toEqual({ limit: '20' });
  });

  it('AC-UP-03 판매자 프로필은 판매자와 숨김 조건을 함께 보낸다', () => {
    expect(listQuery({ q: null, hideSold: true, sellerId: 'u1' }, 'next')).toEqual({
      limit: '20',
      hideSold: '1',
      sellerId: 'u1',
      cursor: 'next',
    });
  });

  it('AC-NB-05 "내 동네만"은 동네 이름을 보낸다', () => {
    expect(listQuery({ q: null, hideSold: true, neighborhood: '마포구' }, null)).toEqual({
      limit: '20',
      hideSold: '1',
      neighborhood: '마포구',
    });
  });

  it('AC-FV-06 관심 목록은 내 경로에서 읽는다', () => {
    expect(listPath({ q: null, hideSold: false, favorites: true })).toBe('/me/favorites');
    expect(listPath({ q: null, hideSold: false })).toBe('/products');
  });
});

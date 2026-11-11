import { describe, expect, it } from 'vitest';
import { listQuery } from './api';

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
});

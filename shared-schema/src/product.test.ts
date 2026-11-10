import { describe, expect, it } from 'vitest';
import { toFieldErrors } from './auth';
import { normalizeText } from './normalize';
import { changeStatusSchema, createProductSchema, listProductsQuerySchema, updateProductSchema } from './product';

const KEY = '0b1f4c1e-7d43-4a51-9c7e-2f6f1a2b3c4d';
const valid = { title: '원목 의자', price: 15000, description: '상태 좋아요', imageIds: [], idempotencyKey: KEY };

function errors(input: Record<string, unknown>) {
  const result = createProductSchema.safeParse({ ...valid, ...input });
  return result.success ? {} : toFieldErrors(result.error);
}

describe('normalizeText', () => {
  it('[AC-PC-05] 한 줄 칸은 줄바꿈을 공백으로 바꾸고 연속 공백을 하나로 줄인다', () => {
    expect(normalizeText('  원목\n의자   팝니다 ​')).toBe('원목 의자 팝니다');
  });

  it('[AC-CM-54] 여러 줄 칸은 줄바꿈을 보존하되 빈 줄은 한 줄까지만 남긴다', () => {
    expect(normalizeText('첫 줄\r\n둘째 줄\n\n\n\n셋째 줄  \n', { multiline: true })).toBe('첫 줄\n둘째 줄\n\n셋째 줄');
  });
});

describe('상품 등록 스키마', () => {
  it('[AC-PC-02, 07] 사진과 설명 없이도 통과하고 기본값이 채워진다', () => {
    const parsed = createProductSchema.parse({ title: '의자', price: 0, idempotencyKey: KEY });
    expect(parsed).toMatchObject({ description: '', imageIds: [], price: 0 });
  });

  it('[AC-PC-05] 제목은 2~40자', () => {
    expect(errors({ title: '' }).title).toBe('제목을 입력해 주세요');
    expect(errors({ title: ' 가 ' }).title).toBe('제목은 2자 이상 입력해 주세요');
    expect(errors({ title: '가'.repeat(41) }).title).toBe('제목은 40자까지 입력할 수 있어요');
    expect(errors({ title: '가'.repeat(40) }).title).toBeUndefined();
  });

  it('[AC-PC-06] 가격은 0~1억의 정수', () => {
    expect(errors({ price: -1 }).price).toBeDefined();
    expect(errors({ price: 1.5 }).price).toBeDefined();
    expect(errors({ price: 100_000_001 }).price).toBeDefined();
    expect(errors({ price: '1000' }).price).toBe('가격을 입력해 주세요');
    expect(errors({ price: 100_000_000 }).price).toBeUndefined();
  });

  it('[AC-PC-07, 11] 설명은 2,000자, 사진은 10장까지이고 같은 사진은 한 번만', () => {
    expect(errors({ description: '가'.repeat(2001) }).description).toBe('설명은 2,000자까지 입력할 수 있어요');
    const ids = Array.from({ length: 11 }, (_, i) => `u${i}`);
    expect(errors({ imageIds: ids }).imageIds).toBe('사진은 10장까지 올릴 수 있어요');
    expect(errors({ imageIds: ['a', 'a'] }).imageIds).toBe('같은 사진이 두 번 들어 있어요');
  });

  it('[AC-PC-08] 멱등 키는 uuid여야 한다', () => {
    expect(errors({ idempotencyKey: 'nope' }).idempotencyKey).toBeDefined();
  });
});

describe('상품 수정 · 상태 변경 스키마', () => {
  it('[AC-PC-34] 수정은 보낸 필드만 다루고 status는 버린다', () => {
    const parsed = updateProductSchema.parse({ title: '새 제목', status: 'SOLD' });
    expect(parsed).toEqual({ title: '새 제목' });
  });

  it('[AC-PC-31] 사진은 기존(imageId) · 새(uploadId)를 섞은 최종 목록이다', () => {
    const images = [{ imageId: 'i1' }, { uploadId: 'u1' }];
    expect(updateProductSchema.parse({ images }).images).toEqual(images);
    expect(updateProductSchema.safeParse({ images: [{ imageId: 'i1', uploadId: 'u1' }] }).success).toBe(false);
    expect(updateProductSchema.safeParse({ images: [{ imageId: 'i1' }, { imageId: 'i1' }] }).success).toBe(false);
  });

  it('[AC-PD-05] 구매자는 거래완료일 때만 지정할 수 있다', () => {
    expect(changeStatusSchema.safeParse({ status: 'SOLD', buyerId: 'u1' }).success).toBe(true);
    expect(changeStatusSchema.safeParse({ status: 'SOLD' }).success).toBe(true);
    expect(changeStatusSchema.safeParse({ status: 'RESERVED', buyerId: 'u1' }).success).toBe(false);
    expect(changeStatusSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});

describe('목록 쿼리 스키마', () => {
  it('[AC-PL-04] limit은 기본 20, 최대 50으로 맞춘다', () => {
    expect(listProductsQuerySchema.parse({}).limit).toBe(20);
    expect(listProductsQuerySchema.parse({ limit: '999' }).limit).toBe(50);
    expect(listProductsQuerySchema.parse({ limit: 'abc' }).limit).toBe(20);
    expect(listProductsQuerySchema.parse({ limit: '0' }).limit).toBe(20);
  });

  it('[AC-PL-12, 13] 검색어는 정규화 후 2자 이상, hideSold는 1일 때만 켜진다', () => {
    expect(listProductsQuerySchema.parse({ q: '  의자 ' }).q).toBe('의자');
    const short = listProductsQuerySchema.safeParse({ q: ' 가 ' });
    expect(short.success ? '' : toFieldErrors(short.error).q).toBe('2자 이상 입력해 주세요');
    expect(listProductsQuerySchema.parse({ hideSold: '1' }).hideSold).toBe(true);
    expect(listProductsQuerySchema.parse({ hideSold: 'true' }).hideSold).toBe(false);
    expect(listProductsQuerySchema.parse({}).hideSold).toBe(false);
  });
});

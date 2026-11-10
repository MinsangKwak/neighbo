import { z } from 'zod';

// 근거: docs/architecture/backend.md 10 API 명세 2절 공유 타입
export const productStatusSchema = z.enum(['ON_SALE', 'RESERVED', 'SOLD']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const imageSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Image = z.infer<typeof imageSchema>;

// 가격은 원 단위 정수, 0 = 나눔, 상한 1억 [AC-CM-51]
export const PRICE_MAX = 100_000_000;

// 목록 카드 [AC-PL-01] — 값이 없으면 null로 명시하고 키를 생략하지 않는다
export const productCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number().int().min(0).max(PRICE_MAX),
  status: productStatusSchema,
  thumbnail: imageSchema.nullable(),
  chatRoomCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type ProductCard = z.infer<typeof productCardSchema>;

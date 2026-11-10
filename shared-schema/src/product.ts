import { z } from 'zod';
import { countGraphemes, normalizeText } from './normalize';
import { userPublicSchema } from './user';

// 근거: docs/architecture/backend.md 10 API 명세 2절 공유 타입 · 4절 상품

export const productStatusSchema = z.enum(['ON_SALE', 'RESERVED', 'SOLD']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  ON_SALE: '판매중',
  RESERVED: '예약중',
  SOLD: '거래완료',
};

// 상태 전이 표 [AC-PD-01] — 여기 없는 전이는 409
export const STATUS_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  ON_SALE: ['RESERVED', 'SOLD'],
  RESERVED: ['SOLD', 'ON_SALE'],
  SOLD: ['ON_SALE'],
};

export const imageSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Image = z.infer<typeof imageSchema>;

export const productImageSchema = z.object({
  id: z.string(),
  // 긴 변 1600px
  url: z.string(),
  // 400px
  thumbnailUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

// 가격은 원 단위 정수, 0 = 나눔, 상한 1억 [AC-CM-51]
export const PRICE_MAX = 100_000_000;
export const TITLE_MIN = 2;
export const TITLE_MAX = 40;
export const DESCRIPTION_MAX = 2000;
export const IMAGES_MAX = 10;

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

// 상세 [AC-PD-10, 22]
export const productDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number().int().min(0).max(PRICE_MAX),
  description: z.string(),
  status: productStatusSchema,
  images: z.array(productImageSchema),
  seller: userPublicSchema,
  chatRoomCount: z.number().int().min(0),
  soldAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

// 상세를 보는 사람 기준 정보 — 비로그인이면 null [결정 0011]
export const viewerSchema = z.object({
  isSeller: z.boolean(),
  existingChatRoomId: z.string().nullable(),
});
export type Viewer = z.infer<typeof viewerSchema>;

export const productResponseSchema = z.object({ product: productDetailSchema });
export type ProductResponse = z.infer<typeof productResponseSchema>;

export const productDetailResponseSchema = z.object({ product: productDetailSchema, viewer: viewerSchema.nullable() });
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;

export const productPageSchema = z.object({ items: z.array(productCardSchema), nextCursor: z.string().nullable() });
export type ProductPage = z.infer<typeof productPageSchema>;

// ── 입력 ─────────────────────────────────────────────

export function checkTitle(title: string): string | null {
  if (title === '') return '제목을 입력해 주세요';
  const length = countGraphemes(title);
  if (length < TITLE_MIN) return '제목은 2자 이상 입력해 주세요';
  if (length > TITLE_MAX) return '제목은 40자까지 입력할 수 있어요';
  return null;
}

export function checkDescription(description: string): string | null {
  return countGraphemes(description) > DESCRIPTION_MAX ? '설명은 2,000자까지 입력할 수 있어요' : null;
}

const titleField = z
  .string({ error: '제목을 입력해 주세요' })
  // 줄바꿈은 공백으로 [AC-PC-05]
  .transform((value) => normalizeText(value))
  .superRefine((value, ctx) => {
    const message = checkTitle(value);
    if (message !== null) ctx.addIssue({ code: 'custom', message });
  });

const priceField = z
  .number({ error: '가격을 입력해 주세요' })
  .int('가격은 원 단위 정수로 입력해 주세요')
  .min(0, '가격은 0원 이상이어야 해요')
  .max(PRICE_MAX, '가격은 1억 원까지 입력할 수 있어요');

const descriptionField = z
  .string({ error: '설명을 확인해 주세요' })
  .transform((value) => normalizeText(value, { multiline: true }))
  .superRefine((value, ctx) => {
    const message = checkDescription(value);
    if (message !== null) ctx.addIssue({ code: 'custom', message });
  });

const idField = z.string().min(1).max(64);

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

// POST /products [AC-PC-01~11]
export const createProductSchema = z.object({
  title: titleField,
  price: priceField,
  description: descriptionField.default(''),
  // Upload id. 순서 = 표시 순서, 첫째가 대표
  imageIds: z
    .array(idField, { error: '사진을 확인해 주세요' })
    .max(IMAGES_MAX, '사진은 10장까지 올릴 수 있어요')
    .refine(unique, '같은 사진이 두 번 들어 있어요')
    .default([]),
  // 폼을 열 때 만든 uuid — 같은 키의 두 번째 요청은 기존 상품을 돌려준다 [AC-PC-08]
  idempotencyKey: z.uuid({ error: '요청을 다시 시도해 주세요' }),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// PATCH /products/:id — 생략한 필드는 그대로. status가 와도 무시한다 [AC-PC-34]
export const updateProductSchema = z.object({
  title: titleField.optional(),
  price: priceField.optional(),
  description: descriptionField.optional(),
  // 최종 사진 목록 (순서 포함). 기존 사진은 imageId, 새 사진은 uploadId
  images: z
    .array(z.union([z.strictObject({ imageId: idField }), z.strictObject({ uploadId: idField })]), {
      error: '사진을 확인해 주세요',
    })
    .max(IMAGES_MAX, '사진은 10장까지 올릴 수 있어요')
    .refine(
      (items) => unique(items.map((item) => ('imageId' in item ? `i:${item.imageId}` : `u:${item.uploadId}`))),
      '같은 사진이 두 번 들어 있어요',
    )
    .optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// PATCH /products/:id/status [AC-PD-01~08]
export const changeStatusSchema = z
  .object({
    status: productStatusSchema,
    // 거래완료일 때만. 생략 · null = 지정 안 함
    buyerId: idField.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== 'SOLD' && value.buyerId != null) {
      ctx.addIssue({ code: 'custom', path: ['buyerId'], message: '구매자는 거래완료일 때만 지정할 수 있어요' });
    }
  });
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const LIST_LIMIT_DEFAULT = 20;
export const LIST_LIMIT_MAX = 50;
export const SEARCH_MIN = 2;

// GET /products [AC-PL-03, 04, 12, 13]
export const listProductsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  // 넘치면 거부하지 않고 50으로 맞춘다
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .catch(LIST_LIMIT_DEFAULT)
    .default(LIST_LIMIT_DEFAULT)
    .transform((value) => Math.min(value, LIST_LIMIT_MAX)),
  q: z
    .string()
    .transform((value) => normalizeText(value))
    .refine((value) => countGraphemes(value) >= SEARCH_MIN, '2자 이상 입력해 주세요')
    .optional(),
  hideSold: z
    .string()
    .optional()
    .transform((value) => value === '1'),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const chatPartnersResponseSchema = z.object({
  items: z.array(z.object({ roomId: z.string(), user: userPublicSchema, lastActivityAt: z.iso.datetime() })),
});
export type ChatPartnersResponse = z.infer<typeof chatPartnersResponseSchema>;

// POST /uploads 응답 — 아바타는 썸네일이 없다
export const uploadSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Upload = z.infer<typeof uploadSchema>;
export const uploadResponseSchema = z.object({ upload: uploadSchema });
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

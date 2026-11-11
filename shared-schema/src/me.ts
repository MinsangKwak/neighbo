import { z } from 'zod';
import { newPasswordField, nicknameField } from './auth';
import { normalizePassword } from './normalize';
import { imageSchema, productCardSchema, productStatusSchema } from './product';
import { userPublicSchema, userSelfSchema } from './user';

// 근거: docs/architecture/backend.md 10 API 명세 7절 내 정보

// GET /me — 본인용 사용자 + 탭에 보일 개수 [AC-MP-11]
export const meCountsSchema = z.object({
  onSale: z.number().int().min(0),
  reserved: z.number().int().min(0),
  sold: z.number().int().min(0),
  purchased: z.number().int().min(0),
});
export type MeCounts = z.infer<typeof meCountsSchema>;

export const meResponseSchema = z.object({ user: userSelfSchema, counts: meCountsSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

const idField = z.string().min(1).max(64);

// PATCH /me — 생략 = 그대로. 여기 없는 키(id · email 등)는 버려진다 [AC-MP-12]
export const updateMeSchema = z.object({
  nickname: nicknameField.optional(),
  // Upload id(kind=AVATAR). null = 기본 이미지로 [AC-MP-08]
  avatarUploadId: idField.nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// PATCH /me/password [AC-MP-09]
export const changePasswordSchema = z
  .object({
    // 현재 비밀번호는 로그인과 같은 방식으로 다듬어 비교한다
    currentPassword: z
      .string({ error: '현재 비밀번호를 입력해 주세요' })
      .transform((value) => normalizePassword(value, { trim: true }))
      .refine((value) => value !== '', '현재 비밀번호를 입력해 주세요'),
    newPassword: newPasswordField,
    newPasswordConfirm: z
      .string({ error: '새 비밀번호를 한 번 더 입력해 주세요' })
      .transform((value) => normalizePassword(value)),
  })
  .superRefine((value, ctx) => {
    if (value.newPasswordConfirm !== value.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['newPasswordConfirm'], message: '비밀번호가 일치하지 않아요' });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: '지금 쓰는 비밀번호와 달라야 해요' });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// 판매 탭 카드 — 거래완료 + 구매자 지정이면 "{구매자}님과 거래" [AC-MP-03]
export const myProductCardSchema = productCardSchema.extend({ buyer: userPublicSchema.nullable() });
export type MyProductCard = z.infer<typeof myProductCardSchema>;
export const myProductPageSchema = z.object({ items: z.array(myProductCardSchema), nextCursor: z.string().nullable() });
export type MyProductPage = z.infer<typeof myProductPageSchema>;

// 구매 내역 — 삭제된 상품도 남는다 [AC-MP-04, 결정 0012]
export const purchaseCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  // 거래 시점 가격
  soldPrice: z.number().int().min(0),
  thumbnail: imageSchema.nullable(),
  seller: userPublicSchema,
  soldAt: z.iso.datetime(),
  // true면 누를 수 없고 "삭제됨"으로 보인다
  deleted: z.boolean(),
});
export type PurchaseCard = z.infer<typeof purchaseCardSchema>;
export const purchasePageSchema = z.object({ items: z.array(purchaseCardSchema), nextCursor: z.string().nullable() });
export type PurchasePage = z.infer<typeof purchasePageSchema>;

const limitField = z.coerce
  .number()
  .int()
  .min(1)
  .catch(20)
  .default(20)
  .transform((value) => Math.min(value, 50));

// GET /me/products — status 필수 [AC-MP-02]
export const myProductsQuerySchema = z.object({
  status: productStatusSchema,
  cursor: z.string().min(1).optional(),
  limit: limitField,
});
export type MyProductsQuery = z.infer<typeof myProductsQuerySchema>;

export const purchasesQuerySchema = z.object({ cursor: z.string().min(1).optional(), limit: limitField });
export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;

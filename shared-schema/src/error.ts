import { z } from 'zod';

// 에러 코드 카탈로그 — 이름은 한번 정하면 바꾸지 않는다 (프론트 분기 기준)
// 근거: docs/architecture/backend.md 06 에러 코드
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: 400, message: '입력 내용을 확인해 주세요' },
  INVALID_CURSOR: { status: 400, message: '목록을 다시 불러올게요' },
  INVALID_FILE: { status: 400, message: '사진 파일을 확인해 주세요' },
  UNSUPPORTED_IMAGE: { status: 400, message: 'jpg, png, webp만 올릴 수 있어요' },
  WRONG_PASSWORD: { status: 400, message: '비밀번호가 맞지 않아요' },
  CANNOT_CHAT_OWN_PRODUCT: { status: 400, message: '내 물건에는 채팅할 수 없어요' },
  NOT_A_CHAT_PARTNER: { status: 400, message: '이 물건으로 대화한 사람만 선택할 수 있어요' },
  UNAUTHORIZED: { status: 401, message: '로그인이 필요해요' },
  INVALID_CREDENTIALS: { status: 401, message: '이메일 또는 비밀번호가 맞지 않아요' },
  FORBIDDEN: { status: 403, message: '권한이 없어요' },
  DEMO_RESTRICTED: { status: 403, message: '둘러보기 계정에서는 바꿀 수 없어요' },
  ORIGIN_MISMATCH: { status: 403, message: '잘못된 요청이에요' },
  NOT_FOUND: { status: 404, message: '찾을 수 없어요' },
  EMAIL_TAKEN: { status: 409, message: '이미 가입된 이메일이에요' },
  NICKNAME_TAKEN: { status: 409, message: '이미 사용 중인 닉네임이에요' },
  INVALID_TRANSITION: { status: 409, message: '지금 상태에서는 바꿀 수 없어요' },
  PRODUCT_SOLD: { status: 409, message: '거래가 완료된 물건이에요' },
  PAYLOAD_TOO_LARGE: { status: 413, message: '파일이 너무 커요' },
  RATE_LIMITED: { status: 429, message: '잠시 후 다시 시도해 주세요' },
  INTERNAL: { status: 500, message: '일시적인 문제가 생겼어요' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as [ErrorCode, ...ErrorCode[]];

// 응답 모양 [AC-CM-10] — fields는 없으면 null로 명시한다
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string(), z.string()).nullable(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const REQUEST_ID_HEADER = 'X-Request-Id';

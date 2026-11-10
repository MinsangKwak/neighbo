import { ERROR_CATALOG, type ErrorCode } from '@neighbo/shared-schema';

// 서비스는 HTTP를 모른다 — 코드만 던지면 상태와 문구는 에러 처리 미들웨어가 카탈로그에서 찾는다
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly fields: Record<string, string> | null = null,
    // 카탈로그 문구보다 구체적으로 말해야 할 때만 (예: 어떤 전이가 안 되는지)
    message: string = ERROR_CATALOG[code].message,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_CATALOG[code].status;
  }
}

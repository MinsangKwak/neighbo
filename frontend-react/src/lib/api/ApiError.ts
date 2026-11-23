import type { ErrorCode } from '@neighbo/shared-schema';

export type ApiErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT';

// 서버 응답 · 네트워크 실패 · 타임아웃을 한 모양으로 — 화면 코드는 code만 보면 된다
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    // 0 = 네트워크 · 타임아웃
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> | null = null,
    readonly requestId: string | null = null,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 사용자에게 보일 문구 — 서버 문구가 없는 경우만 여기서 정한다
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return '인터넷 연결을 확인하고 다시 시도해 주세요';
    if (error.code === 'TIMEOUT') return '응답이 늦어지고 있어요. 다시 시도해 주세요';
    if (error.code === 'INTERNAL' && error.requestId !== null) {
      return `${error.message} (문의 번호 ${error.requestId.slice(0, 6)})`;
    }
    return error.message;
  }
  return '일시적인 문제가 생겼어요';
}

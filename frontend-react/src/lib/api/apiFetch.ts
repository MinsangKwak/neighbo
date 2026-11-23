import { ERROR_CATALOG, REQUEST_ID_HEADER, errorResponseSchema } from '@neighbo/shared-schema';
import { ApiError } from './ApiError';

const TIMEOUT_MS = 10_000;

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
}

// 브라우저의 모든 요청은 같은 오리진 프록시(/api/*)를 지난다 [결정 0004]
// 실패는 전부 ApiError 하나로 바꾼다
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const search = options.query === undefined ? '' : `?${new URLSearchParams(options.query).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`/api${path}${search}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      ...(options.body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }),
    });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new ApiError(timedOut ? 'TIMEOUT' : 'NETWORK', 0, timedOut ? '응답이 늦어지고 있어요' : '연결하지 못했어요');
  } finally {
    clearTimeout(timer);
  }

  const requestId = response.headers.get(REQUEST_ID_HEADER);

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('INTERNAL', response.status, ERROR_CATALOG.INTERNAL.message, null, requestId);
    }
  }

  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    // 약속한 모양이 아닌 실패 (프록시 앞단의 오류 페이지 등)
    throw new ApiError('INTERNAL', response.status, ERROR_CATALOG.INTERNAL.message, null, requestId);
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  throw new ApiError(
    parsed.data.error.code,
    response.status,
    parsed.data.error.message,
    parsed.data.error.fields,
    requestId,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  );
}

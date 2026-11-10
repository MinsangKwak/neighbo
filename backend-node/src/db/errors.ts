// 유니크 위반(P2002)에서 깨진 제약의 인덱스 이름을 읽는다 — 예: "User_email_key"
// 드라이버 어댑터를 쓰면 meta.target이 오지 않고, 어댑터 오류 안에 인덱스 이름이 온다 (I-04)
export function uniqueViolationIndex(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== 'P2002') return null;
  const meta = 'meta' in err && typeof err.meta === 'object' && err.meta !== null ? err.meta : {};
  const adapterError = (meta as { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } })
    .driverAdapterError;
  const index = adapterError?.cause?.constraint?.index;
  if (typeof index === 'string') return index;
  // 어댑터 없이 쓰는 경우의 모양
  const target = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) return target.join('_');
  return typeof target === 'string' ? target : '(unknown)';
}

// 업로드는 24시간 안에 상품이나 프로필에 붙여야 한다 — 그 뒤는 정리 배치의 몫 [AC-PC-19]
// 붙이는 쪽(상품 · 프로필)과 치우는 쪽(jobs/fileCleanup)이 같은 값을 본다
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

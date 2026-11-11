import { AppError } from '../errors/AppError.js';

// 목록 커서 — (정렬 시각, id). 클라이언트에게는 불투명한 문자열이다 [AC-PL-03, 04]
export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.at.toISOString(), cursor.id])).toString('base64url');
}

// 하나 더 읽어 온 행에서 한 쪽을 잘라 내고, 더 있으면 마지막 행으로 다음 커서를 만든다
// 목록 조회는 모두 limit + 1개를 읽어 이 함수에 넘긴다 [AC-CM-12]
export function takePage<Row>(
  rows: Row[],
  limit: number,
  cursorOf: (last: Row) => Cursor | null,
): { items: Row[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const cursor = rows.length > limit && last !== undefined ? cursorOf(last) : null;
  return { items, nextCursor: cursor === null ? null : encodeCursor(cursor) };
}

// 조작된 커서는 400 INVALID_CURSOR
export function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [at, id] = parsed as unknown[];
      const date = typeof at === 'string' ? new Date(at) : null;
      if (date !== null && !Number.isNaN(date.getTime()) && typeof id === 'string' && id !== '' && id.length <= 64) {
        return { at: date, id };
      }
    }
  } catch {
    // 아래에서 같은 오류로 답한다
  }
  throw new AppError('INVALID_CURSOR');
}

// 메시지 커서 — 방 안 번호 하나 (결정 0016). 형식은 목록 커서와 같게 불투명한 문자열로
export function encodeSeqCursor(seq: number): string {
  return Buffer.from(JSON.stringify([seq])).toString('base64url');
}

export function decodeSeqCursor(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 1) {
      const [seq] = parsed as unknown[];
      if (typeof seq === 'number' && Number.isInteger(seq) && seq >= 0 && seq <= 2_147_483_647) return seq;
    }
  } catch {
    // 아래에서 같은 오류로 답한다
  }
  throw new AppError('INVALID_CURSOR');
}

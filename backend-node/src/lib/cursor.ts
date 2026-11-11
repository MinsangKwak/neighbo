import { AppError } from '../errors/AppError.js';

// 목록 커서 — (정렬 시각, id). 클라이언트에게는 불투명한 문자열이다 [AC-PL-03, 04]
export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.at.toISOString(), cursor.id])).toString('base64url');
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

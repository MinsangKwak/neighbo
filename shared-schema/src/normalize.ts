// 프론트와 서버가 같은 함수로 입력을 정리한다 [AC-CM-63]

// 눈에 보이지 않는 문자 — 복사해 온 값에 섞여 들어온다
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

// 앞뒤 공백 · 제로폭 문자 제거 → NFKC(전각 → 반각) → 소문자 [AC-SU-06]
export function normalizeEmail(input: string): string {
  return input.replace(ZERO_WIDTH, '').trim().normalize('NFKC').toLowerCase();
}

// 제로폭 문자 제거 + NFC. 가입은 앞뒤 공백을 거부하고(지우지 않고 알린다),
// 로그인은 앞뒤 공백을 지운 뒤 비교한다 [AC-SU-09b, AC-LI-05b]
export function normalizePassword(input: string, options: { trim?: boolean } = {}): string {
  const cleaned = input.replace(ZERO_WIDTH, '').normalize('NFC');
  return options.trim === true ? cleaned.trim() : cleaned;
}

// 앞뒤 공백 제거, 연속 공백은 하나로 [SU-IN-44]
export function normalizeNickname(input: string): string {
  return input.replace(ZERO_WIDTH, '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

// 사용자가 한 글자로 느끼는 단위(grapheme)로 센다 — 한글 · 결합 문자 · 이모지
export function countGraphemes(input: string): number {
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  let count = 0;
  for (const _ of segmenter.segment(input)) count += 1;
  return count;
}

// UTF-8로 옮겼을 때의 바이트 수 — 브라우저 · Node 어느 쪽 타입에도 기대지 않게 직접 센다
export function utf8ByteLength(input: string): number {
  let bytes = 0;
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

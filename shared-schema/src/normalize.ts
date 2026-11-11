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

// 사용자가 느끼는 글자 단위로 앞에서부터 max개만 남긴다 — 넘치는 붙여넣기를 자를 때 [AC-CM-64]
export function clipGraphemes(input: string, max: number): string {
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  let result = '';
  let count = 0;
  for (const { segment } of segmenter.segment(input)) {
    if (count === max) break;
    result += segment;
    count += 1;
  }
  return result;
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

// 글 안에서는 지우면 안 되는 제로폭 문자가 있다 — ZWJ(U+200D)는 👨‍👩‍👧 같은 이모지를 잇고, ZWNJ(U+200C)는 일부 문자 체계의 철자다 (I-10)
// 뜻 없이 섞여 들어오는 셋만 지운다: 제로폭 공백 · 단어 결합자 · BOM
const TEXT_INVISIBLE = /[\u200B\u2060\uFEFF]/g;
// 앞뒤에 홀로 남은 결합자는 이을 대상이 없으니 공백과 함께 잘라 낸다
const TEXT_EDGES = /^[\s\u200C\u200D]+|[\s\u200C\u200D]+$/g;

// 제목 · 설명 · 메시지 공통 [AC-CM-52, 54]
// 한 줄 칸: 줄바꿈을 공백으로, 연속 공백은 하나로. 여러 줄 칸: 줄바꿈은 보존하되 빈 줄은 한 줄까지
export function normalizeText(input: string, options: { multiline?: boolean } = {}): string {
  const cleaned = input.replace(TEXT_INVISIBLE, '').normalize('NFC').replace(/\r\n?/g, '\n');
  if (options.multiline === true) {
    return cleaned
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(TEXT_EDGES, '');
  }
  return cleaned.replace(/\s+/g, ' ').replace(TEXT_EDGES, '');
}

// 코드포인트 수 — DB의 char_length와 같은 단위
export function countCodePoints(input: string): number {
  let count = 0;
  for (const _ of input) count += 1;
  return count;
}

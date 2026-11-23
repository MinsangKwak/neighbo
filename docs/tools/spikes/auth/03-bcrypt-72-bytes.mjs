'use strict';
// bcrypt는 입력의 앞 72바이트만 쓴다 — "64자 이하" 규칙이 이 한계를 지키는지 확인
import bcrypt from 'bcrypt';

const bytes = (s) => Buffer.byteLength(s, 'utf8');

const ascii64 = 'a'.repeat(64);
console.log('① 영문 64자', bytes(ascii64), '바이트 — 한계 안');

// 한글은 글자당 3바이트: 24자 = 72바이트. 25번째 글자부터는 해시에 반영되지 않는다
const base = '가'.repeat(24);
const p1 = base + '나다라마바사아자차카';
const p2 = base + '전혀다른뒷부분입니다';
console.log('② 한글 34자 두 개', bytes(p1), '바이트 · 서로 다른가', p1 !== p2);
const hash = await bcrypt.hash(p1, 10);
console.log('   p1으로 만든 해시를 p2로 검증 →', await bcrypt.compare(p2, hash), '(true면 뒷부분이 무시된 것)');

// 이모지는 글자(grapheme) 하나가 더 크다
const family = '👨‍👩‍👧‍👦';
console.log('③ 가족 이모지 1자', bytes(family), '바이트 → 3자면', bytes(family.repeat(3)), '바이트');
const e1 = family.repeat(3) + 'A';
const e2 = family.repeat(3) + 'B';
const eh = await bcrypt.hash(e1, 10);
console.log('   이모지 3자 + A 의 해시를 이모지 3자 + B 로 검증 →', await bcrypt.compare(e2, eh));

// 대안 1: 바이트 길이를 검증에서 막는다
const tooLong = (s) => bytes(s.normalize('NFC')) > 72;
console.log('④ 대안 1 — 72바이트 초과 거부:', 'p1', tooLong(p1), '· 영문 64자', tooLong(ascii64));

// 대안 2: SHA-256으로 먼저 줄인 뒤 bcrypt (base64 44바이트 — 0바이트 문제 없음)
import { createHash } from 'node:crypto';
const pre = (s) => createHash('sha256').update(s.normalize('NFC')).digest('base64');
const h2 = await bcrypt.hash(pre(p1), 10);
console.log('⑤ 대안 2 — 사전 해시:', 'p1 통과', await bcrypt.compare(pre(p1), h2), '· p2 통과', await bcrypt.compare(pre(p2), h2));

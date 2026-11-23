'use strict';
// bcrypt: salt 확인 · cost별 소요 시간 · 네이티브와 순수 JS 구현 비교
import bcrypt from 'bcrypt';
import bcryptjs from 'bcryptjs';

const pw = 'correct horse battery staple';
const a = await bcrypt.hash(pw, 10);
const b = await bcrypt.hash(pw, 10);
console.log('① 같은 비밀번호 두 번');
console.log('  ', a);
console.log('  ', b);
console.log('   같은가', a === b, '· 둘 다 검증 통과', await bcrypt.compare(pw, a), await bcrypt.compare(pw, b));
console.log('   구조: $2b$ · cost', a.slice(4, 6), '· salt 22자', a.slice(7, 29), '· 해시 31자');

async function measure(lib, cost, n) {
  const t = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); await lib.hash(pw, cost); t.push(performance.now() - s); }
  t.sort((x, y) => x - y);
  return Math.round(t[Math.floor(n / 2)]);
}
console.log('② cost별 해시 1회 중앙값(ms)');
for (const cost of [10, 11, 12, 13, 14]) {
  const n = cost >= 13 ? 3 : 5;
  console.log(`   cost ${cost} · 네이티브 ${await measure(bcrypt, cost, n)} · 순수 JS ${await measure(bcryptjs, cost, n)}`);
}

// ③ 해시가 이벤트 루프를 막는가 — 해시 중에 타이머가 얼마나 밀리는지
async function lag(label, fn) {
  let max = 0, last = performance.now();
  const timer = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last - 10); last = n; }, 10);
  await fn();
  clearInterval(timer);
  console.log(`   ${label} · 타이머 최대 지연 ${Math.round(max)}ms`);
}
console.log('③ cost 12 해시 4개를 동시에 돌릴 때 이벤트 루프');
await lag('네이티브(스레드 풀)', () => Promise.all([1, 2, 3, 4].map(() => bcrypt.hash(pw, 12))));
await lag('순수 JS(메인 스레드)', () => Promise.all([1, 2, 3, 4].map(() => bcryptjs.hash(pw, 12))));

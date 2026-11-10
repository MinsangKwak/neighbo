'use strict';
// 없는 이메일로 로그인할 때 응답 시간이 달라지면 계정 존재 여부가 드러난다 — 더미 해시로 평탄화되는지 측정
import bcrypt from 'bcrypt';

const COST = 12;
const users = new Map([['a@example.com', await bcrypt.hash('password-of-a', COST)]]);
const DUMMY = await bcrypt.hash('dummy-never-matches', COST);

async function loginNaive(email, pw) {
  const hash = users.get(email);
  if (!hash) return false; // 바로 반환 — 빠르다
  return bcrypt.compare(pw, hash);
}
async function loginFlat(email, pw) {
  const hash = users.get(email) ?? DUMMY; // 없어도 같은 비용을 치른다
  const ok = await bcrypt.compare(pw, hash);
  return users.has(email) && ok;
}
async function median(fn, email, n = 7) {
  const t = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); await fn(email, 'wrong-password'); t.push(performance.now() - s); }
  t.sort((x, y) => x - y);
  return t[Math.floor(n / 2)].toFixed(1);
}
console.log('틀린 비밀번호로 로그인 — 중앙값(ms)');
console.log('  단순 구현 · 있는 이메일', await median(loginNaive, 'a@example.com'), '· 없는 이메일', await median(loginNaive, 'nobody@example.com'));
console.log('  더미 해시 · 있는 이메일', await median(loginFlat, 'a@example.com'), '· 없는 이메일', await median(loginFlat, 'nobody@example.com'));
console.log('  더미 해시로 없는 이메일이 로그인되는가', await loginFlat('nobody@example.com', 'dummy-never-matches'));

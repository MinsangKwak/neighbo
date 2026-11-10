'use strict';
// JWT(HS256)를 node:crypto만으로 서명·검증한다 — 라이브러리가 대신 해 주는 일을 직접 확인
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const b64url = (input) => Buffer.from(input).toString('base64url');
const SECRET = randomBytes(32);

function sign(payload, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function verify(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: '형식' };
  const [head, body, sig] = parts;
  let header;
  try { header = JSON.parse(Buffer.from(head, 'base64url')); } catch { return { ok: false, reason: '헤더 파싱' }; }
  // 헤더의 alg를 믿고 검증 방식을 고르지 않는다 — 서버가 정한 하나만 허용
  if (header.alg !== 'HS256') return { ok: false, reason: `alg 거부(${header.alg})` };
  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 비교
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: '서명 불일치' };
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return { ok: false, reason: '만료' };
  return { ok: true, payload };
}

const now = Math.floor(Date.now() / 1000);
const token = sign({ sub: 'user_1', ver: 0, iat: now, exp: now + 60 }, SECRET);
console.log('토큰 길이', token.length, '· 점으로 나뉜 조각', token.split('.').length);
console.log('① 정상', JSON.stringify(verify(token, SECRET)));

// ② 페이로드는 암호화가 아니라 인코딩 — 누구나 읽는다
console.log('② 비밀 없이 읽은 페이로드', Buffer.from(token.split('.')[1], 'base64url').toString());

// ③ 페이로드 변조: sub를 바꾸고 서명은 그대로
const [h, , s] = token.split('.');
const forged = `${h}.${b64url(JSON.stringify({ sub: 'user_2', ver: 0, iat: now, exp: now + 60 }))}.${s}`;
console.log('③ 변조', JSON.stringify(verify(forged, SECRET)));

// ④ alg: none — 서명 없는 토큰
const none = `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify({ sub: 'user_2', exp: now + 60 }))}.`;
console.log('④ alg none', JSON.stringify(verify(none, SECRET)));

// ⑤ 만료
console.log('⑤ 만료', JSON.stringify(verify(sign({ sub: 'user_1', exp: now - 1 }, SECRET), SECRET)));

// ⑥ 다른 비밀로 서명 (재시작마다 비밀이 바뀌는 상황 = CM-AU-10)
console.log('⑥ 다른 비밀', JSON.stringify(verify(sign({ sub: 'user_1', exp: now + 60 }, randomBytes(32)), SECRET)));

// ⑦ 서명만으로는 "비밀번호를 바꾼 뒤의 옛 토큰"을 못 막는다 — ver 비교가 필요한 이유
const userRow = { id: 'user_1', tokenVersion: 1 };
const old = verify(token, SECRET);
console.log('⑦ 서명은 유효', old.ok, '· ver 일치', old.payload.ver === userRow.tokenVersion, '→ 거부해야 함');

// ⑧ 소켓 토큰(purpose: socket)을 세션 쿠키 자리에 넣으면? — purpose 검사가 없으면 통과한다
const socketToken = sign({ sub: 'user_1', ver: 1, purpose: 'socket', exp: now + 60 }, SECRET);
const r = verify(socketToken, SECRET);
console.log('⑧ 소켓 토큰을 세션으로 검증', r.ok, '· purpose', r.payload.purpose, '→ 용도 검사를 따로 해야 함');

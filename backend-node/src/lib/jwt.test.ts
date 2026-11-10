import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './jwt.js';

const SECRET = 'jwt-secret-0123456789-0123456789-0123';
const claims = { sub: 'user_1', ver: 3, purpose: 'session' as const };

describe('JWT', () => {
  it('[AC-LI-17] 페이로드는 sub · ver · purpose · iat · exp뿐이다', () => {
    const token = signToken(claims, SECRET, 60, new Date('2026-11-10T00:00:00Z'));
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as object;
    expect(payload).toEqual({ sub: 'user_1', ver: 3, purpose: 'session', iat: 1794268800, exp: 1794268860 });
    expect(verifyToken(token, SECRET, 'session', new Date('2026-11-10T00:00:30Z'))).toEqual(payload);
  });

  it('만료 시각이 되면 거부한다', () => {
    const token = signToken(claims, SECRET, 60, new Date('2026-11-10T00:00:00Z'));
    expect(verifyToken(token, SECRET, 'session', new Date('2026-11-10T00:01:00Z'))).toBeNull();
  });

  it('다른 비밀 · 바뀐 페이로드 · 모양이 다른 값을 거부한다', () => {
    const token = signToken(claims, SECRET, 60);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, sub: 'admin', iat: 0, exp: 9999999999 })).toString('base64url');
    expect(verifyToken(token, `${SECRET}x`, 'session')).toBeNull();
    expect(verifyToken(`${header}.${forgedPayload}.${signature}`, SECRET, 'session')).toBeNull();
    expect(verifyToken('a.b', SECRET, 'session')).toBeNull();
    expect(verifyToken('', SECRET, 'session')).toBeNull();
  });

  it('alg: none · 다른 알고리즘 헤더를 거부한다', () => {
    const token = signToken(claims, SECRET, 60);
    const [, payload] = token.split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyToken(`${none}.${payload}.`, SECRET, 'session')).toBeNull();
  });

  it('용도가 다른 토큰은 통과하지 못한다', () => {
    const socket = signToken({ ...claims, purpose: 'socket' }, SECRET, 60);
    expect(verifyToken(socket, SECRET, 'session')).toBeNull();
    expect(verifyToken(socket, SECRET, 'socket')).not.toBeNull();
  });
});

import { createHmac, timingSafeEqual } from 'node:crypto';

// HS256 JWT를 표준 라이브러리로 서명 · 검증한다
// 라이브러리를 들이지 않은 이유: 쓰는 알고리즘이 하나이고, 검증 순서를 스파이크에서 직접 확인했다
// 근거: docs/tech-notes.md JWT와 비밀번호 해시

export type TokenPurpose = 'session' | 'socket';

export interface TokenPayload {
  sub: string;
  ver: number;
  purpose: TokenPurpose;
  iat: number;
  exp: number;
  // 소켓 토큰에만 있다 — 이 토큰을 내준 세션이 끝나는 시각(초). 연결이 세션보다 오래 살지 않게 한다 (I-11)
  sxp?: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signToken(
  claims: { sub: string; ver: number; purpose: TokenPurpose; sxp?: number },
  secret: string,
  ttlSeconds: number,
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: TokenPayload = { ...claims, iat, exp: iat + ttlSeconds };
  const body = `${HEADER}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

// 검증 순서: 모양 → 헤더(HS256만) → 서명 → 만료 → 용도
// 실패 이유는 돌려주지 않는다 — 호출하는 쪽은 모두 같은 401로 답한다
export function verifyToken(
  token: string,
  secret: string,
  purpose: TokenPurpose,
  now: Date = new Date(),
): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  // alg를 토큰이 고르게 두지 않는다 (none · 다른 알고리즘 거부)
  if (header !== HEADER) return null;

  const expected = sign(`${header}.${payload}`, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const claims = parsed as Partial<TokenPayload>;
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.ver !== 'number' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    return null;
  }
  if (claims.exp <= Math.floor(now.getTime() / 1000)) return null;
  // 소켓 토큰도 같은 비밀로 서명되므로 용도를 보지 않으면 세션 자리에서 통과한다
  if (claims.purpose !== purpose) return null;
  if (claims.sxp !== undefined && typeof claims.sxp !== 'number') return null;

  return claims as TokenPayload;
}

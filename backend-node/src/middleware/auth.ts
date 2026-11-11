import type { Request, RequestHandler, Response } from 'express';
import { SESSION_COOKIE } from '@neighbo/shared-schema';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { AppError } from '../errors/AppError.js';
import type { User } from '../generated/prisma/client.js';
import { signToken, verifyToken } from '../lib/jwt.js';

// 세션은 7일, 남은 기간이 절반 아래면 새 쿠키로 연장한다 [AC-CM-03]
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  setCookie(res: Response, user: Pick<User, 'id' | 'tokenVersion'>): void;
  clearCookie(res: Response): void;
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
}

// 지금 요청의 세션이 끝나는 시각(초) — 소켓 토큰에 실어 보낸다
export function sessionExpiry(res: Response): number {
  const exp = res.locals.sessionExp as number | undefined;
  if (exp === undefined) throw new Error('sessionExpiry()는 requireAuth 뒤에서만 쓸 수 있다');
  return exp;
}

export function currentUser(res: Response): User {
  const user = res.locals.user as User | undefined;
  // requireAuth 뒤에서만 부른다 — 여기 걸리면 라우트 조립 실수다
  if (user === undefined) throw new Error('currentUser()는 requireAuth 뒤에서만 쓸 수 있다');
  return user;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.get('Cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function createSession(config: Config, db: Db): Session {
  // 로컬 개발(http)에서는 Secure 쿠키가 저장되지 않는다
  const secure = config.NODE_ENV === 'staging' || config.NODE_ENV === 'production';
  const attributes = `HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`;

  const setCookie: Session['setCookie'] = (res, user) => {
    const token = signToken(
      { sub: user.id, ver: user.tokenVersion, purpose: 'session' },
      config.JWT_SECRET,
      SESSION_TTL_SECONDS,
    );
    res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_SECONDS}; ${attributes}`);
  };

  const clearCookie: Session['clearCookie'] = (res) => {
    res.append('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; ${attributes}`);
  };

  // 검증 순서: 쿠키 존재 → 서명 · 만료 · 용도 → 사용자 조회 → tokenVersion
  // 결과: 사용자 / 'none'(쿠키 없음) / 'invalid'(있지만 못 쓰는 토큰)
  async function resolve(req: Request, res: Response): Promise<User | 'none' | 'invalid'> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token === undefined || token === '') return 'none';

    const payload = verifyToken(token, config.JWT_SECRET, 'session');
    if (payload === null) return 'invalid';

    // 비밀번호 변경 후 옛 토큰을 막으려면 요청마다 사용자를 읽어야 한다
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (user === null || user.deletedAt !== null || user.tokenVersion !== payload.ver) return 'invalid';

    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    const renew = remaining < SESSION_TTL_SECONDS / 2;
    if (renew) setCookie(res, user);
    res.locals.sessionExp = renew ? Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS : payload.exp;
    return user;
  }

  const requireAuth: RequestHandler = async (req, res, next) => {
    const result = await resolve(req, res);
    if (result === 'none' || result === 'invalid') {
      // 못 쓰는 토큰은 지우게 한다 [AC-CM-04]
      if (result === 'invalid') clearCookie(res);
      next(new AppError('UNAUTHORIZED'));
      return;
    }
    res.locals.user = result;
    // 사용자별 응답은 공유 캐시에 남기지 않는다 [AC-LI-13]
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  // 만료 · 변조된 토큰이어도 401을 내지 않고 비로그인으로 처리한다
  const optionalAuth: RequestHandler = async (req, res, next) => {
    const result = await resolve(req, res);
    if (result === 'invalid') clearCookie(res);
    if (typeof result === 'object') {
      res.locals.user = result;
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  };

  return { setCookie, clearCookie, requireAuth, optionalAuth };
}

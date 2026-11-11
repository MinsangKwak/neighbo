import { Router, type RequestHandler } from 'express';
import {
  emailAvailableQuerySchema,
  loginSchema,
  nicknameAvailableQuerySchema,
  signupSchema,
  type AuthResponse,
  type AvailabilityResponse,
  type SocketTokenResponse,
} from '@neighbo/shared-schema';
import { currentUser, sessionExpiry, type Session } from '../../middleware/auth.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { toUserSelf } from './serialize.js';
import type { AuthService } from './service.js';

// 소켓 토큰은 연결할 때 한 번 쓰고 버린다 [AC-LI-18a]
export const SOCKET_TOKEN_TTL_SECONDS = 60;

interface AuthRouteDeps {
  service: AuthService;
  // 소켓 토큰을 서명하는 함수 — 비밀값은 조립하는 쪽만 안다
  signSocketToken: (user: { id: string; tokenVersion: number }, sessionExp: number) => string;
  session: Session;
  // IP 분당 10 — 엔드포인트마다 따로 센다 [AC-CM-32]
  ipLimit: (name: string) => RequestHandler;
}

export function createAuthRouter({ service, session, ipLimit, signSocketToken }: AuthRouteDeps): Router {
  const router = Router();

  router.post('/signup', ipLimit('signup'), async (req, res) => {
    const user = await service.signup(parseOrThrow(signupSchema, req.body));
    session.setCookie(res, user);
    const body: AuthResponse = { user: toUserSelf(user) };
    res.status(201).json(body);
  });

  router.post('/login', ipLimit('login'), async (req, res) => {
    const user = await service.login(parseOrThrow(loginSchema, req.body));
    session.setCookie(res, user);
    const body: AuthResponse = { user: toUserSelf(user) };
    res.json(body);
  });

  // 쿠키가 없어도 204 — 몇 번을 불러도 결과가 같다
  router.post('/logout', (_req, res) => {
    session.clearCookie(res);
    res.status(204).end();
  });

  // 참고용 응답이다. 가입 요청의 409가 최종 판단 [AC-SU-08, 16]
  router.get('/email-available', ipLimit('email-available'), async (req, res) => {
    const { email } = parseOrThrow(emailAvailableQuerySchema, req.query);
    const available = await service.isEmailAvailable(email);
    const body: AvailabilityResponse = { available, message: available ? null : '이미 가입된 이메일이에요' };
    res.json(body);
  });

  router.get('/nickname-available', ipLimit('nickname-available'), async (req, res) => {
    const { nickname } = parseOrThrow(nicknameAvailableQuerySchema, req.query);
    const available = await service.isNicknameAvailable(nickname);
    const body: AvailabilityResponse = { available, message: available ? null : '이미 사용 중인 닉네임이에요' };
    res.json(body);
  });

  // 소켓은 프록시를 거치지 않아 쿠키가 가지 않는다 — 쿠키로 인증한 이 요청이 연결용 토큰을 내준다 (결정 0004)
  router.get('/socket-token', session.requireAuth, (_req, res) => {
    const body: SocketTokenResponse = {
      token: signSocketToken(currentUser(res), sessionExpiry(res)),
      expiresAt: new Date(Date.now() + SOCKET_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
    res.json(body);
  });

  return router;
}

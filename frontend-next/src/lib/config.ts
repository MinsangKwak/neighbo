import 'server-only';
import { z } from 'zod';

// 서버 전용 환경 변수 — 브라우저 번들에 들어가면 안 되는 값
// 근거: docs/architecture/backend.md 11절 1. 환경 변수
const serverEnvSchema = z.object({
  API_URL: z
    .string()
    .regex(/^https?:\/\/[^/]+$/, '경로 없는 주소여야 한다')
    .transform((value) => new URL(value).origin),
  PROXY_SECRET: z.string().refine((v) => Buffer.byteLength(v, 'utf8') >= 32, '32바이트 이상이어야 한다'),
});

export type ServerConfig = z.infer<typeof serverEnvSchema>;

export class ConfigError extends Error {
  // 이름과 이유만 담는다 — 값은 넣지 않는다
  constructor(readonly problems: { name: string; reason: string }[]) {
    super(`환경 변수 오류: ${problems.map((p) => `${p.name} (${p.reason})`).join(', ')}`);
    this.name = 'ConfigError';
  }
}

export function parseServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({
        name: String(issue.path[0] ?? '(알 수 없음)'),
        reason: issue.code === 'invalid_type' ? '값이 없다' : issue.message,
      })),
    );
  }
  return result.data;
}

// 코드에서 process.env를 읽는 곳은 여기 한 줄뿐이다
// eslint-disable-next-line no-restricted-properties
const env = process.env;

let cached: ServerConfig | undefined;

// 빌드가 아니라 첫 요청에서 검증한다 — 빌드 환경에는 서버 전용 값이 없을 수 있다
export function getServerConfig(): ServerConfig {
  cached ??= parseServerConfig(env);
  return cached;
}

// 로그인 화면의 [채워 넣기]에 쓰는 데모 계정 비밀번호 [AC-LI-19]
// 화면에 그대로 나가는 공개 값이지만 저장소에는 적지 않는다. 없으면 데모 안내를 숨긴다
export function getDemoPassword(): string | null {
  const value = env.DEMO_PASSWORD;
  return value === undefined || value.length < 8 ? null : value;
}

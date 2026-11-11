import { z } from 'zod';

// 환경 변수는 부팅할 때 한 번 검증하고, 틀리면 요청을 받기 전에 종료한다
// 근거: docs/architecture/backend.md 11절 1. 환경 변수

const secret = z.string().refine((v) => Buffer.byteLength(v, 'utf8') >= 32, '32바이트 이상이어야 한다');

// 빈 문자열은 "없음"으로 본다 — .env의 `KEY=` 줄을 값으로 읽지 않게
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'postgresql:// 로 시작해야 한다'),
    JWT_SECRET: secret,
    PROXY_SECRET: secret,
    ALLOWED_ORIGIN: z.string().regex(/^https?:\/\/[^/]+$/, '경로 없는 오리진 하나여야 한다'),
    ALLOWED_ORIGIN_PATTERN: optional(z.string()),
    STORAGE_DRIVER: z.enum(['local', 's3']),
    STORAGE_LOCAL_DIR: optional(z.string()),
    S3_ENDPOINT: optional(z.string()),
    S3_BUCKET: optional(z.string()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),
    S3_PUBLIC_URL: optional(z.string()),
    BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DEMO_PASSWORD: optional(z.string().min(8)),
    // 샘플 데이터(사용자 10 · 상품 60 · 방 15 · 메시지 300)를 시드에 더한다 — 양이 많을 때의 화면 확인용
    SEED_SAMPLE: optional(z.literal('1', { error: '켜려면 1이어야 한다' })),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, when: string) => {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${when}일 때 필요하다` });
      }
    };
    // 샘플 방은 데모 계정에 붙는다 — 로그인해서 볼 수 있는 계정이 그 둘뿐이다
    if (env.SEED_SAMPLE !== undefined) need('DEMO_PASSWORD', 'SEED_SAMPLE=1');
    if (env.STORAGE_DRIVER === 'local') need('STORAGE_LOCAL_DIR', 'STORAGE_DRIVER=local');
    if (env.STORAGE_DRIVER === 's3') {
      need('S3_ENDPOINT', 'STORAGE_DRIVER=s3');
      need('S3_BUCKET', 'STORAGE_DRIVER=s3');
      need('S3_ACCESS_KEY_ID', 'STORAGE_DRIVER=s3');
      need('S3_SECRET_ACCESS_KEY', 'STORAGE_DRIVER=s3');
      need('S3_PUBLIC_URL', 'STORAGE_DRIVER=s3');
    }
    // 미리보기 주소 패턴이 운영에 남으면 임의의 미리보기 배포가 쓰기 요청을 보낼 수 있다 (T-08)
    if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGIN_PATTERN !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGIN_PATTERN'],
        message: 'production에서는 비워야 한다',
      });
    }
    if (env.ALLOWED_ORIGIN_PATTERN !== undefined) {
      try {
        new RegExp(env.ALLOWED_ORIGIN_PATTERN);
      } catch {
        ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGIN_PATTERN'], message: '정규식이 아니다' });
      }
    }
  });

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  // 이름과 이유만 담는다 — 값은 어디에도 넣지 않는다 (로그에 비밀값이 남지 않게)
  constructor(readonly problems: { name: string; reason: string }[]) {
    super(`환경 변수 오류: ${problems.map((p) => `${p.name} (${p.reason})`).join(', ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(env);
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

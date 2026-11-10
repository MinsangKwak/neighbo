import { describe, expect, it } from 'vitest';
import { baseEnv } from '../test/env.js';
import { ConfigError, loadConfig } from './config.js';

function problemsOf(env: Record<string, string | undefined>) {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems.map((p) => p.name);
    throw err;
  }
  return [];
}

describe('환경 변수 검증', () => {
  it('필수 값이 모두 있으면 기본값을 채워 돌려준다', () => {
    const config = loadConfig(baseEnv);
    expect(config.PORT).toBe(4000);
    expect(config.BCRYPT_COST).toBe(12);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('빠진 필수 값을 전부 이름으로 알려준다', () => {
    const names = problemsOf({ NODE_ENV: 'test' });
    expect(names).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET', 'PROXY_SECRET', 'ALLOWED_ORIGIN', 'STORAGE_DRIVER']),
    );
  });

  it('32바이트보다 짧은 비밀값은 거부한다', () => {
    expect(problemsOf({ ...baseEnv, JWT_SECRET: 'short' })).toEqual(['JWT_SECRET']);
  });

  it('오류 메시지에 값을 담지 않는다', () => {
    const leaked = 'super-secret-but-short';
    try {
      loadConfig({ ...baseEnv, PROXY_SECRET: leaked, DATABASE_URL: `mysql://${leaked}` });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(JSON.stringify(err)).not.toContain(leaked);
      expect((err as Error).message).not.toContain(leaked);
    }
  });

  it('[T-08] production에 ALLOWED_ORIGIN_PATTERN이 있으면 부팅하지 않는다', () => {
    const env = { ...baseEnv, ALLOWED_ORIGIN_PATTERN: '^https://neighbo-.*\\.vercel\\.app$' };
    expect(problemsOf({ ...env, NODE_ENV: 'production' })).toEqual(['ALLOWED_ORIGIN_PATTERN']);
    expect(problemsOf({ ...env, NODE_ENV: 'staging' })).toEqual([]);
  });

  it('저장소 종류에 맞는 값이 없으면 거부한다', () => {
    expect(problemsOf({ ...baseEnv, STORAGE_LOCAL_DIR: undefined })).toEqual(['STORAGE_LOCAL_DIR']);
    expect(problemsOf({ ...baseEnv, STORAGE_DRIVER: 's3' })).toEqual(
      expect.arrayContaining(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL']),
    );
  });

  it('.env의 빈 값(KEY=)은 없는 것으로 본다', () => {
    expect(problemsOf({ ...baseEnv, ALLOWED_ORIGIN_PATTERN: '', DEMO_PASSWORD: '' })).toEqual([]);
  });

  it('BCRYPT_COST는 10~14만 받는다', () => {
    expect(problemsOf({ ...baseEnv, BCRYPT_COST: '9' })).toEqual(['BCRYPT_COST']);
    expect(problemsOf({ ...baseEnv, BCRYPT_COST: '15' })).toEqual(['BCRYPT_COST']);
  });
});

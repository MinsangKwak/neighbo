// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ConfigError, parseServerConfig } from './config';

describe('프론트엔드 서버 환경 변수', () => {
  const env = { API_URL: 'http://localhost:4000', PROXY_SECRET: 'proxy-secret-0123456789-0123456789' };

  it('필수 값이 있으면 통과한다', () => {
    expect(parseServerConfig(env).API_URL).toBe('http://localhost:4000');
  });

  it('빠진 값 · 경로가 붙은 주소 · 짧은 비밀값을 이름으로 알려주고 값은 담지 않는다', () => {
    try {
      parseServerConfig({ API_URL: 'http://localhost:4000/api', PROXY_SECRET: 'short-secret' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).problems.map((p) => p.name)).toEqual(['API_URL', 'PROXY_SECRET']);
      expect((err as Error).message).not.toContain('short-secret');
    }
    expect(() => parseServerConfig({})).toThrow(ConfigError);
  });
});

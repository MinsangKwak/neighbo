import { describe, expect, it } from 'vitest';
import { baseEnv } from '../../test/env.js';
import { loadConfig } from '../config.js';
import { createStorage } from './index.js';
import { createS3Storage } from './s3Storage.js';

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

function setup(reply: (seen: Seen) => { status: number; body?: string } = () => ({ status: 200 })) {
  const seen: Seen[] = [];
  const storage = createS3Storage({
    endpoint: 'https://account.example-storage.com/',
    bucket: 'neighbo-images',
    region: 'auto',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret-example',
    publicUrl: 'https://img.example.com',
    fetch: (async (input: Request) => {
      const entry: Seen = {
        method: input.method,
        url: input.url,
        headers: Object.fromEntries(input.headers.entries()),
        body: Buffer.from(await input.arrayBuffer()),
      };
      seen.push(entry);
      const { status, body } = reply(entry);
      return new Response(status === 204 ? null : (body ?? ''), { status });
    }) as unknown as typeof fetch,
  });
  return { storage, seen };
}

describe('S3 호환 저장소', () => {
  it('버킷 아래 키로 서명한 PUT을 보내고, 내용 형식과 긴 캐시를 붙인다', async () => {
    const { storage, seen } = setup();
    await storage.put('products/abc.webp', Buffer.from([1, 2, 3]), 'image/webp');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'PUT',
      url: 'https://account.example-storage.com/neighbo-images/products/abc.webp',
    });
    expect([...(seen[0]?.body ?? [])]).toEqual([1, 2, 3]);
    expect(seen[0]?.headers['content-type']).toBe('image/webp');
    expect(seen[0]?.headers['cache-control']).toContain('immutable');
    // 서명에 접근 키 · 리전 · 서비스가 들어간다. 비밀 키는 어디에도 실리지 않는다
    expect(seen[0]?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/,
    );
    expect(JSON.stringify(seen[0])).not.toContain('secret-example');
  });

  it('경로가 붙은 엔드포인트 아래에서도 버킷 · 키 순서로 주소를 만든다', async () => {
    const seen: string[] = [];
    const storage = createS3Storage({
      endpoint: 'https://ref.storage.example.co/storage/v1/s3',
      bucket: 'images',
      region: 'ap-southeast-1',
      accessKeyId: 'k',
      secretAccessKey: 's',
      publicUrl: 'https://ref.example.co/storage/v1/object/public/images',
      fetch: ((input: Request) => {
        seen.push(input.url);
        return Promise.resolve(new Response('', { status: 200 }));
      }) as unknown as typeof fetch,
    });
    await storage.put('products/a b.webp', Buffer.from([1]), 'image/webp');
    expect(seen).toEqual(['https://ref.storage.example.co/storage/v1/s3/images/products/a%20b.webp']);
    expect(storage.url('products/a.webp')).toBe('https://ref.example.co/storage/v1/object/public/images/products/a.webp');
  });

  it('읽는 주소는 공개 주소 아래 키다', () => {
    const { storage } = setup();
    expect(storage.url('avatars/u1.webp')).toBe('https://img.example.com/avatars/u1.webp');
    expect(storage.localDirectory).toBeNull();
  });

  it('쓰기가 거절되면 상태 코드와 함께 실패한다 — 사진 없이 성공한 것처럼 넘어가지 않는다', async () => {
    const { storage } = setup(() => ({ status: 403, body: '<Error><Code>AccessDenied</Code></Error>' }));
    await expect(storage.put('products/a.webp', Buffer.from([1]), 'image/webp')).rejects.toThrow(/403.*AccessDenied/);
  });

  it('여러 키를 지우고, 이미 없는 키(404)는 조용히 넘어간다', async () => {
    const { storage, seen } = setup((entry) => ({ status: entry.url.endsWith('gone.webp') ? 404 : 204 }));
    await storage.remove(['products/a.webp', 'products/gone.webp']);
    expect(seen.map((entry) => entry.method)).toEqual(['DELETE', 'DELETE']);
  });

  it('삭제가 다른 이유로 실패하면 던진다', async () => {
    const { storage } = setup(() => ({ status: 500, body: 'boom' }));
    await expect(storage.remove(['products/a.webp'])).rejects.toThrow(/500/);
  });

  it('버킷 밖을 가리키는 키는 요청을 보내기 전에 거절한다', async () => {
    const { storage, seen } = setup();
    await expect(storage.put('../other-bucket/x.webp', Buffer.from([1]), 'image/webp')).rejects.toThrow('저장소 밖');
    await expect(storage.remove(['products//x.webp'])).rejects.toThrow('저장소 밖');
    expect(seen).toHaveLength(0);
  });
});

describe('저장소 설정', () => {
  const s3Env = {
    ...baseEnv,
    STORAGE_DRIVER: 's3',
    STORAGE_LOCAL_DIR: undefined,
    S3_ENDPOINT: 'https://account.example-storage.com',
    S3_BUCKET: 'neighbo-images',
    S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    S3_SECRET_ACCESS_KEY: 'secret-example',
    S3_PUBLIC_URL: 'https://img.example.com',
  };

  it('STORAGE_DRIVER=s3이면 외부 저장소를 만든다', () => {
    const storage = createStorage(loadConfig(s3Env));
    expect(storage.localDirectory).toBeNull();
    expect(storage.url('products/a.webp')).toBe('https://img.example.com/products/a.webp');
  });

  it('주소 모양이 틀리면 부팅에서 멈춘다 — 깨진 사진 주소가 DB에 쌓이기 전에', () => {
    expect(() => loadConfig({ ...s3Env, S3_ENDPOINT: 'account.example-storage.com' })).toThrow();
    // 경로가 붙는 저장소 주소도 받는다
    expect(loadConfig({ ...s3Env, S3_ENDPOINT: 'https://ref.storage.example.co/storage/v1/s3' }).S3_ENDPOINT).toContain('/storage/v1/s3');
    expect(() => loadConfig({ ...s3Env, S3_PUBLIC_URL: 'https://img.example.com/' })).toThrow();
    expect(() => loadConfig({ ...s3Env, S3_PUBLIC_URL: 'http://img.example.com' })).toThrow();
  });
});

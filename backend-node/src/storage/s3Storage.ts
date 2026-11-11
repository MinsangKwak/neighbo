import { AwsClient } from 'aws4fetch';
import type { ImageStorage, StoredFile } from './ImageStorage.js';

// S3 호환 저장소 — 재배포해도 사진이 남는다. 서명(SigV4)만 라이브러리에 맡기고 요청은 fetch로 보낸다
// 읽기는 저장소의 공개 주소로 브라우저가 직접 한다. 백엔드를 거치지 않는다
export interface S3Options {
  // 예: https://<계정>.r2.cloudflarestorage.com — 버킷 이름은 넣지 않는다
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  // 브라우저가 읽는 주소의 앞부분. 예: https://pub-xxxx.r2.dev
  publicUrl: string;
  fetch?: typeof fetch;
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');
// 목록 응답(XML)의 글자 참조를 푼다 — 키에 & 같은 글자가 있을 수 있다
const decodeXml = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name] ?? '');

export function createS3Storage(options: S3Options): ImageStorage {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: options.region,
  });
  const send = options.fetch ?? fetch;
  const base = `${trimSlash(options.endpoint)}/${options.bucket}`;
  const publicBase = trimSlash(options.publicUrl);
  // 키의 각 마디를 따로 인코딩한다 — '/'는 경로 구분으로 남긴다
  const objectUrl = (key: string) => {
    if (key.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error('저장소 밖의 경로다');
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  };
  const request = async (method: 'PUT' | 'DELETE', key: string, init: RequestInit = {}) => {
    const signed = await client.sign(objectUrl(key), { method, ...init });
    const response = await send(signed);
    // 본문을 읽어 연결을 돌려준다
    const text = await response.text();
    return { status: response.status, text };
  };

  return {
    async put(key, data, contentType) {
      const { status, text } = await request('PUT', key, {
        body: new Uint8Array(data),
        headers: {
          'content-type': contentType,
          // 같은 키에 다른 내용을 쓰지 않으므로 오래 캐시해도 된다 (시드 사진은 내용이 같다)
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
      if (status < 200 || status >= 300) throw new Error(`저장소 쓰기 실패 (${status}): ${text.slice(0, 200)}`);
    },
    async remove(keys) {
      await Promise.all(
        keys.map(async (key) => {
          const { status, text } = await request('DELETE', key);
          // 없는 키는 조용히 넘어간다 — S3는 204, 일부 호환 저장소는 404를 준다
          if ((status < 200 || status >= 300) && status !== 404) {
            throw new Error(`저장소 삭제 실패 (${status}): ${text.slice(0, 200)}`);
          }
        }),
      );
    },
    // ListObjectsV2 — 한 번에 1,000개까지 오고, 더 있으면 이어 받는 표(token)를 준다
    async list() {
      const files: StoredFile[] = [];
      let token: string | null = null;
      do {
        const query = new URLSearchParams({ 'list-type': '2', ...(token === null ? {} : { 'continuation-token': token }) });
        const signed = await client.sign(`${base}?${query.toString()}`, { method: 'GET' });
        const response = await send(signed);
        const xml = await response.text();
        if (!response.ok) throw new Error(`저장소 목록 실패 (${response.status}): ${xml.slice(0, 200)}`);
        for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = /<Key>([\s\S]*?)<\/Key>/.exec(body ?? '')?.[1];
          const modified = /<LastModified>([^<]+)<\/LastModified>/.exec(body ?? '')?.[1];
          if (key !== undefined && modified !== undefined) files.push({ key: decodeXml(key), modifiedAt: new Date(modified) });
        }
        const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next !== undefined ? decodeXml(next) : null;
      } while (token !== null);
      return files;
    },
    url: (key) => `${publicBase}/${key}`,
    localDirectory: null,
  };
}

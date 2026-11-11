import type { Config } from '../config.js';
import { createLocalStorage, type ImageStorage } from './ImageStorage.js';
import { createS3Storage } from './s3Storage.js';

export function createStorage(config: Config): ImageStorage {
  if (config.STORAGE_DRIVER === 'local' && config.STORAGE_LOCAL_DIR !== undefined) {
    // 브라우저는 프록시를 거쳐 /api/files/* 로 읽는다
    return createLocalStorage(config.STORAGE_LOCAL_DIR, '/api/files');
  }
  if (
    config.STORAGE_DRIVER === 's3' &&
    config.S3_ENDPOINT !== undefined &&
    config.S3_BUCKET !== undefined &&
    config.S3_ACCESS_KEY_ID !== undefined &&
    config.S3_SECRET_ACCESS_KEY !== undefined &&
    config.S3_PUBLIC_URL !== undefined
  ) {
    return createS3Storage({
      endpoint: config.S3_ENDPOINT,
      bucket: config.S3_BUCKET,
      region: config.S3_REGION ?? 'auto',
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      publicUrl: config.S3_PUBLIC_URL,
    });
  }
  // 설정 검증이 먼저 걸러 주므로 여기 오지 않는다 — 조용히 로컬로 떨어지지 않게 멈춘다
  throw new Error('저장소 설정이 맞지 않는다');
}

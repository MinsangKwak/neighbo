import type { Config } from '../config.js';
import { createLocalStorage, type ImageStorage } from './ImageStorage.js';

export function createStorage(config: Config): ImageStorage {
  if (config.STORAGE_DRIVER === 'local' && config.STORAGE_LOCAL_DIR !== undefined) {
    // 브라우저는 프록시를 거쳐 /api/files/* 로 읽는다
    return createLocalStorage(config.STORAGE_LOCAL_DIR, '/api/files');
  }
  // S3 호환 저장소는 아직 구현하지 않았다 — 조용히 로컬로 떨어지지 않고 부팅에서 멈춘다
  throw new Error('STORAGE_DRIVER=s3는 아직 지원하지 않는다. local을 쓴다');
}

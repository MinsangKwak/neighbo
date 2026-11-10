import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

// 이미지 저장소 — 저장 위치가 바뀌어도 호출부가 바뀌지 않게 인터페이스 뒤에 둔다
export interface ImageStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  // 없는 키는 조용히 넘어간다 — 정리 작업이 다시 돌아도 같은 결과
  remove(keys: string[]): Promise<void>;
  url(key: string): string;
  // 로컬 구현만: 백엔드가 직접 내보낼 디렉터리. 외부 저장소는 null
  readonly localDirectory: string | null;
}

// 로컬 디스크 구현 — 개발과 단일 인스턴스용. 파일은 백엔드가 /files/* 로 내보낸다
export function createLocalStorage(directory: string, publicBase: string): ImageStorage {
  const root = resolve(directory);
  const pathOf = (key: string) => {
    const path = resolve(join(root, key));
    // 키로 저장소 밖을 가리키지 못하게 한다
    if (!path.startsWith(root + sep)) throw new Error('저장소 밖의 경로다');
    return path;
  };
  return {
    async put(key, data) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
    async remove(keys) {
      await Promise.all(keys.map((key) => rm(pathOf(key), { force: true })));
    },
    url: (key) => `${publicBase}/${key}`,
    localDirectory: root,
  };
}

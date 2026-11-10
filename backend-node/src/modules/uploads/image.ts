import sharp from 'sharp';
import { AppError } from '../../errors/AppError.js';

export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
// 디코딩 전에 막는 압축 폭탄 한도 [AC-PC-13]
const MAX_PIXELS = 50_000_000;

export type UploadKind = 'PRODUCT' | 'AVATAR';

// 확장자와 Content-Type은 보내는 쪽이 정한다 — 파일 앞부분의 바이트로만 형식을 판단한다 [AC-CM-33]
export function detectImageType(head: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

export interface ProcessedImage {
  main: Buffer;
  // 상품 사진만 400px 썸네일을 만든다
  thumbnail: Buffer | null;
  width: number;
  height: number;
}

// 검사 순서: 싼 것부터 — 크기 → 매직 바이트 → 메타데이터(픽셀 수) → 디코딩
export async function processImage(file: Buffer, kind: UploadKind): Promise<ProcessedImage> {
  if (file.length === 0) throw new AppError('INVALID_FILE');
  const type = detectImageType(file);
  if (type === null) throw new AppError('UNSUPPORTED_IMAGE');

  try {
    // limitInputPixels: 메타데이터만 보고 한도를 넘으면 디코딩하지 않는다
    const open = () => sharp(file, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
    const meta = await open().metadata();
    // 매직 바이트와 실제 내용이 다른 파일
    if (meta.format !== type) throw new AppError('INVALID_FILE');

    // rotate(): EXIF 회전을 픽셀에 적용한다. 출력에는 메타데이터(위치 정보 포함)를 싣지 않는다 [AC-PC-14]
    if (kind === 'AVATAR') {
      const { data, info } = await open()
        .rotate()
        .resize({ width: 512, height: 512, fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      return { main: data, thumbnail: null, width: info.width, height: info.height };
    }

    const { data, info } = await open()
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(data)
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return { main: data, thumbnail, width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // 손상된 파일 · 픽셀 한도 초과
    throw new AppError('INVALID_FILE');
  }
}

import sharp from 'sharp';
import { thumbnailKey } from '../modules/products/service.js';
import type { ImageStorage } from '../storage/ImageStorage.js';

// 시드 사진은 코드로 직접 그린다 — 다른 서비스의 상품 사진을 가져오지 않는다
// 근거: docs/architecture/backend.md 11절 4. 시드 데이터

export interface SeedImage {
  main: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

// 가로 · 세로 · 정사각 · 넓은 화면 — 목록과 상세에서 비율이 다른 사진을 고루 본다
const SIZES = [
  [1200, 900],
  [900, 1200],
  [1000, 1000],
  [1600, 900],
] as const;

function drawing(index: number, width: number, height: number): string {
  const hue = (index * 47) % 360;
  const short = Math.min(width, height);
  // 글자는 넣지 않는다 — 실행 이미지에 글꼴이 없을 수 있다
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 82%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 65% 62%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.32}" cy="${height * 0.4}" r="${short * 0.22}" fill="hsl(${(hue + 180) % 360} 60% 92%)" opacity="0.85"/>
    <rect x="${width * 0.48}" y="${height * 0.46}" width="${short * 0.36}" height="${short * 0.3}" rx="${short * 0.04}"
      fill="hsl(${(hue + 300) % 360} 55% 45%)" opacity="0.8" transform="rotate(${(index % 5) * 6 - 12} ${width * 0.6} ${height * 0.6})"/>
  </svg>`;
}

// 서로 다른 그림 count장 — 업로드와 같은 형식(webp 본문 + 400px 썸네일)으로 만든다
export async function drawSeedImages(count: number): Promise<SeedImage[]> {
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const [width, height] = SIZES[index % SIZES.length] ?? SIZES[0];
      const { data, info } = await sharp(Buffer.from(drawing(index, width, height)))
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const thumbnail = await sharp(data).resize({ width: 400, height: 400, fit: 'inside' }).webp({ quality: 78 }).toBuffer();
      return { main: data, thumbnail, width: info.width, height: info.height };
    }),
  );
}

// 아바타 한 장 (512 정사각)
export async function drawSeedAvatar(index: number): Promise<Buffer> {
  return sharp(Buffer.from(drawing(index + 3, 512, 512)))
    .webp({ quality: 82 })
    .toBuffer();
}

// 상품 사진 한 장을 저장하고 ProductImage 행에 들어갈 값을 돌려준다
export async function putSeedImage(storage: ImageStorage, key: string, image: SeedImage) {
  await storage.put(key, image.main, 'image/webp');
  await storage.put(thumbnailKey(key), image.thumbnail, 'image/webp');
  return {
    storageKey: key,
    url: storage.url(key),
    thumbnailUrl: storage.url(thumbnailKey(key)),
    width: image.width,
    height: image.height,
  };
}

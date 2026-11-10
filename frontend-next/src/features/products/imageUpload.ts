import { errorResponseSchema, UPLOAD_MAX_BYTES, type Upload } from '@neighbo/shared-schema';
import { ApiError } from '@/lib/api/ApiError';

const MAX_SIDE = 1600;

// 브라우저가 열지 못한 사진. 이름으로 구분하므로 name을 반드시 지정한다 — 지정하지 않으면 'Error'다
export class UnreadableImageError extends Error {
  override readonly name = 'UnreadableImageError';
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new UnreadableImageError()) : resolve(blob)), 'image/jpeg', quality);
  });
}

// 보내기 전에 브라우저가 긴 변 1600px JPEG로 다시 인코딩한다 [AC-PC-12, 13]
// HEIC처럼 서버가 받지 않는 형식도 브라우저가 열 수 있으면 여기서 JPEG가 된다. 열 수 없으면 사용자에게 알린다
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') throw new UnreadableImageError();
  let bitmap: ImageBitmap;
  try {
    // from-image: 사진에 적힌 회전 방향을 반영해서 연다
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UnreadableImageError();
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context === null) throw new UnreadableImageError();
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const first = await toJpeg(canvas, 0.85);
  // 그래도 4MB를 넘으면 품질을 낮춰 한 번 더
  return first.size <= UPLOAD_MAX_BYTES ? first : toJpeg(canvas, 0.7);
}

// 진행률을 보여주려고 XMLHttpRequest를 쓴다 — fetch는 보낸 양을 알려 주지 않는다 [AC-PC-10]
export function uploadImage(blob: Blob, kind: 'PRODUCT' | 'AVATAR', onProgress: (ratio: number) => void): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?kind=${kind}`);
    xhr.responseType = 'json';
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError('NETWORK', 0, '연결하지 못했어요'));
    xhr.ontimeout = () => reject(new ApiError('TIMEOUT', 0, '응답이 늦어지고 있어요'));
    xhr.onload = () => {
      const body: unknown = xhr.response;
      if (xhr.status === 201 && typeof body === 'object' && body !== null && 'upload' in body) {
        resolve((body as { upload: Upload }).upload);
        return;
      }
      const parsed = errorResponseSchema.safeParse(body);
      reject(
        parsed.success
          ? new ApiError(parsed.data.error.code, xhr.status, parsed.data.error.message)
          : new ApiError('INTERNAL', xhr.status, '사진을 올리지 못했어요'),
      );
    };
    const form = new FormData();
    form.append('file', blob, 'photo.jpg');
    xhr.send(form);
  });
}

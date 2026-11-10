import { randomUUID } from 'node:crypto';
import busboy from 'busboy';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { UploadResponse } from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { AppError } from '../../errors/AppError.js';
import { currentUser, type Session } from '../../middleware/auth.js';
import { parseOrThrow } from '../../middleware/validate.js';
import type { ImageStorage } from '../../storage/ImageStorage.js';
import { thumbnailKey } from '../products/service.js';
import { processImage, UPLOAD_MAX_BYTES } from './image.js';
import type { WorkQueue } from './queue.js';

// 처리 방식은 파일보다 먼저 알아야 해서 쿼리로 받는다 (T-09)
const querySchema = z.object({ kind: z.enum(['PRODUCT', 'AVATAR'], { error: '업로드 종류를 확인해 주세요' }) });

// multipart 경계 · 헤더가 차지하는 여유분
const MULTIPART_OVERHEAD = 64 * 1024;

// multipart에서 파일 하나를 읽는다. 4MB에서 스트림을 끊는다 [AC-CM-34]
function readSingleFile(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.get('Content-Length'));
    if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD) {
      reject(new AppError('PAYLOAD_TOO_LARGE'));
      return;
    }
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: UPLOAD_MAX_BYTES, fields: 0 } });
    } catch {
      // multipart가 아닌 본문
      reject(new AppError('INVALID_FILE'));
      return;
    }

    let file: Buffer | null = null;
    let failure: AppError | null = null;
    parser.on('file', (_name, stream) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      // 헤더를 속여도 여기서 잘린다
      stream.on('limit', () => {
        failure = new AppError('PAYLOAD_TOO_LARGE');
      });
      stream.on('end', () => {
        file = Buffer.concat(chunks);
      });
      // 닫는 경계 없이 끊긴 본문은 parser가 아니라 이 스트림에서 오류가 난다
      // 받아 주지 않으면 처리되지 않은 오류로 프로세스가 죽는다
      stream.on('error', () => {
        failure = new AppError('INVALID_FILE');
        reject(failure);
      });
    });
    parser.on('error', () => reject(new AppError('INVALID_FILE')));
    parser.on('close', () => {
      if (failure !== null) reject(failure);
      else if (file === null) reject(new AppError('INVALID_FILE'));
      else resolve(file);
    });
    req.pipe(parser);
  });
}

interface UploadRouteDeps {
  db: Db;
  storage: ImageStorage;
  session: Session;
  queue: WorkQueue;
  // 사용자 분당 30
  userLimit: RequestHandler;
}

export function createUploadRouter({ db, storage, session, queue, userLimit }: UploadRouteDeps): Router {
  const router = Router();

  // 사진 한 장. 멱등하지 않다 — 중복은 상품에 연결되지 않아 24시간 뒤 배치가 지운다
  router.post('/', session.requireAuth, userLimit, async (req, res) => {
    const user = currentUser(res);
    const { kind } = parseOrThrow(querySchema, req.query);
    const file = await readSingleFile(req);
    const image = await queue(() => processImage(file, kind));

    const key = `${kind === 'PRODUCT' ? 'products' : 'avatars'}/${randomUUID()}.webp`;
    await storage.put(key, image.main, 'image/webp');
    if (image.thumbnail !== null) await storage.put(thumbnailKey(key), image.thumbnail, 'image/webp');

    // 업로더를 기록한다 — 상품에 붙일 때 소유를 확인한다 [AC-PC-18]
    const upload = await db.upload.create({
      data: {
        uploaderId: user.id,
        kind,
        storageKey: key,
        url: storage.url(key),
        thumbnailUrl: image.thumbnail === null ? null : storage.url(thumbnailKey(key)),
        width: image.width,
        height: image.height,
      },
    });
    const body: UploadResponse = {
      upload: {
        id: upload.id,
        url: upload.url,
        thumbnailUrl: upload.thumbnailUrl,
        width: upload.width,
        height: upload.height,
      },
    };
    res.status(201).json(body);
  });

  return router;
}

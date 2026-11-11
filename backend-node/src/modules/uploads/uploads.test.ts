import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { uploadResponseSchema } from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, signup } from '../../../test/app.js';
import { AppError } from '../../errors/AppError.js';
import { detectImageType } from './image.js';
import { createWorkQueue } from './queue.js';

beforeEach(resetDb);

type App = ReturnType<typeof createTestApp>['app'];


const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });

function upload(app: App, cookie: string, file: Buffer, kind = 'PRODUCT', name = 'photo.jpg') {
  return request(app).post('/uploads').query({ kind }).set('Origin', ORIGIN).set('Cookie', cookie).attach('file', file, name);
}

// 응답의 URL(/api/files/…)을 백엔드 경로(/files/…)로
const backendPath = (url: string) => url.replace('/api/files', '/files');

describe('POST /uploads', () => {
  it('[AC-PC-14] 상품 사진은 긴 변 1600 원본과 400 썸네일 두 벌의 webp로 저장되고 업로더가 기록된다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const res = await upload(app, user.cookie, await solid(3000, 2000).jpeg().toBuffer());
    expect(res.status).toBe(201);
    const { upload: saved } = uploadResponseSchema.parse(res.body);
    expect(saved).toMatchObject({ width: 1600, height: 1067 });

    const main = await request(app).get(backendPath(saved.url)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(main.status).toBe(200);
    expect(main.headers['content-type']).toBe('image/webp');
    expect(main.headers['cache-control']).toContain('immutable');
    const thumb = await request(app).get(backendPath(saved.thumbnailUrl ?? '')).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const thumbMeta = await sharp(thumb.body as Buffer).metadata();
    expect([thumbMeta.format, thumbMeta.width, thumbMeta.height]).toEqual(['webp', 400, 267]);

    const row = await db.upload.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row).toMatchObject({ uploaderId: user.id, kind: 'PRODUCT' });
  });

  it('[AC-PC-14] EXIF 회전을 픽셀에 적용하고 EXIF는 남기지 않는다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    // 가로 800×400으로 저장됐지만 "시계 방향 90도로 돌려 보라"는 표시가 붙은 사진
    const rotated = await solid(800, 400).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const res = await upload(app, user.cookie, rotated);
    expect(res.body.upload).toMatchObject({ width: 400, height: 800 });
    const file = await request(app).get(backendPath(res.body.upload.url as string)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('작은 사진은 키우지 않고, png · webp도 받는다. 아바타는 512 정사각 하나다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    expect((await upload(app, user.cookie, await solid(300, 200).png().toBuffer(), 'PRODUCT', 'a.png')).body.upload).toMatchObject({ width: 300, height: 200 });
    expect((await upload(app, user.cookie, await solid(300, 200).webp().toBuffer(), 'PRODUCT', 'a.webp')).status).toBe(201);
    const avatar = await upload(app, user.cookie, await solid(900, 600).jpeg().toBuffer(), 'AVATAR');
    expect(avatar.body.upload).toMatchObject({ width: 512, height: 512, thumbnailUrl: null });
  });

  it('[AC-CM-33, AC-PC-12] 확장자만 .jpg인 텍스트 · GIF는 400 UNSUPPORTED_IMAGE다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const text = await upload(app, user.cookie, Buffer.from('<script>alert(1)</script>'.repeat(10)), 'PRODUCT', 'evil.jpg');
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe('UNSUPPORTED_IMAGE');
    const gif = await upload(app, user.cookie, await solid(10, 10).gif().toBuffer(), 'PRODUCT', 'a.gif');
    expect(gif.body.error.code).toBe('UNSUPPORTED_IMAGE');
    expect(await db.upload.count()).toBe(0);
  });

  it('[AC-PC-15] 0바이트 · 손상된 파일 · 파일 없는 요청은 400 INVALID_FILE이다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    expect((await upload(app, user.cookie, Buffer.alloc(0))).body.error.code).toBe('INVALID_FILE');
    const jpeg = await solid(200, 200).jpeg().toBuffer();
    const broken = Buffer.concat([jpeg.subarray(0, 40), Buffer.alloc(200, 7)]);
    expect((await upload(app, user.cookie, broken)).body.error.code).toBe('INVALID_FILE');
    const noFile = await request(app).post('/uploads').query({ kind: 'PRODUCT' }).set('Origin', ORIGIN).set('Cookie', user.cookie).send({ a: 1 });
    expect(noFile.body.error.code).toBe('INVALID_FILE');
  });

  it('닫는 경계 없이 끊긴 multipart 본문은 400 INVALID_FILE이고 서버는 계속 응답한다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const truncated = Buffer.concat([
      Buffer.from('--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
      await solid(50, 50).jpeg().toBuffer(),
    ]);
    const res = await request(app)
      .post('/uploads')
      .query({ kind: 'PRODUCT' })
      .set('Origin', ORIGIN)
      .set('Cookie', user.cookie)
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send(truncated);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
    expect((await request(app).get('/healthz')).status).toBe(200);
  });

  it('[AC-PC-13] 5,000만 픽셀을 넘는 사진은 디코딩하지 않고 400 INVALID_FILE이다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    // 파일은 작지만 펼치면 6,400만 픽셀인 단색 PNG — 압축 폭탄의 모양
    const bomb = await solid(8000, 8000).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const res = await upload(app, user.cookie, bomb, 'PRODUCT', 'bomb.png');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('[AC-CM-34] 4MB를 넘는 파일은 413이다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const big = Buffer.concat([await solid(10, 10).jpeg().toBuffer(), Buffer.alloc(4 * 1024 * 1024)]);
    const res = await upload(app, user.cookie, big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('로그인이 필요하고, kind가 없거나 틀리면 400이다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const jpeg = await solid(10, 10).jpeg().toBuffer();
    expect((await request(app).post('/uploads').query({ kind: 'PRODUCT' }).set('Origin', ORIGIN).attach('file', jpeg, 'a.jpg')).status).toBe(401);
    const bad = await upload(app, user.cookie, jpeg, 'BANNER');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('[AC-PC-10, 17] 올린 사진을 상품에 붙이면 상세와 목록에 나온다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'seller');
    const uploaded = (await upload(app, user.cookie, await solid(1200, 900).jpeg().toBuffer())).body.upload;
    const created = await post(app, '/products').set('Cookie', user.cookie).send({
      title: '원목 의자',
      price: 1000,
      imageIds: [uploaded.id],
      idempotencyKey: '0b1f4c1e-7d43-4a51-9c7e-2f6f1a2b3c4d',
    });
    expect(created.body.product.images[0]).toMatchObject({ url: uploaded.url, width: 1200, height: 900 });
    const list = await request(app).get('/products');
    expect(list.body.items[0].thumbnail).toEqual({ url: uploaded.thumbnailUrl, width: 400, height: 300 });
  });
});

describe('형식 판별과 처리 대기열', () => {
  it('앞부분 바이트만으로 jpeg · png · webp를 가린다', async () => {
    expect(detectImageType(await solid(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageType(await solid(4, 4).png().toBuffer())).toBe('png');
    expect(detectImageType(await solid(4, 4).webp().toBuffer())).toBe('webp');
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(2))).toBeNull();
  });

  it('동시에 2개까지만 돌리고, 대기열이 가득 차면 429다', async () => {
    const queue = createWorkQueue(2, 1);
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const work = () =>
      queue(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
      });

    const jobs = [work(), work(), work()];
    await Promise.resolve();
    // 네 번째는 기다릴 자리가 없다
    await expect(work()).rejects.toBeInstanceOf(AppError);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 10));
    releases.splice(0).forEach((release) => release());
    await Promise.all(jobs);
    expect(peak).toBe(2);
    expect(running).toBe(0);
  });
});

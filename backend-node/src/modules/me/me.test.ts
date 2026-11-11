import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { meResponseSchema, myProductPageSchema, purchasePageSchema } from '@neighbo/shared-schema';
import { createTestApp, db, ORIGIN, post, resetDb, sessionCookie, signup, TEST_PASSWORD } from '../../../test/app.js';

beforeEach(resetDb);

type Ctx = ReturnType<typeof createTestApp>;
type App = Ctx['app'];
const PASSWORD = TEST_PASSWORD;

const get = (app: App, path: string, cookie: string) => request(app).get(path).set('Cookie', cookie);
const patch = (app: App, path: string, cookie: string) => request(app).patch(path).set('Origin', ORIGIN).set('Cookie', cookie);
const login = (app: App, name: string, password: string) =>
  post(app, '/auth/login').send({ email: `${name}@example.com`, password });

async function createProduct(app: App, cookie: string, title: string) {
  const res = await post(app, '/products').set('Cookie', cookie).send({ title, price: 15000, idempotencyKey: randomUUID() });
  return res.body.product.id as string;
}
const setStatus = (app: App, cookie: string, id: string, body: Record<string, unknown>) =>
  patch(app, `/products/${id}/status`, cookie).send(body);

async function makeAvatar(uploaderId: string, data: Record<string, unknown> = {}) {
  const key = `avatars/${randomUUID()}.webp`;
  return db.upload.create({
    data: { uploaderId, kind: 'AVATAR', storageKey: key, url: `/files/${key}`, thumbnailUrl: null, width: 512, height: 512, ...data },
  });
}

const password = (current: string, next: string) => ({ currentPassword: current, newPassword: next, newPasswordConfirm: next });

describe('GET /me', () => {
  it('[AC-MP-11] 본인용 사용자와 탭 개수를 돌려준다 — 삭제된 상품은 판매 쪽에서 빠지고 구매에는 남는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const ids = [];
    for (const title of ['의자', '책상', '조명', '선반', '거울']) ids.push(await createProduct(app, seller.cookie, title));
    await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId: ids[2] });
    await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId: ids[3] });
    await setStatus(app, seller.cookie, ids[1]!, { status: 'RESERVED' });
    await setStatus(app, seller.cookie, ids[2]!, { status: 'SOLD', buyerId: buyer.id });
    await setStatus(app, seller.cookie, ids[3]!, { status: 'SOLD', buyerId: buyer.id });
    // 거래한 뒤 판매자가 글을 지웠다
    await request(app).delete(`/products/${ids[3]}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);
    await request(app).delete(`/products/${ids[4]}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);

    const mine = await get(app, '/me', seller.cookie);
    expect(mine.headers['cache-control']).toBe('no-store');
    const body = meResponseSchema.parse(mine.body);
    expect(body.user).toMatchObject({ id: seller.id, email: 'seller@example.com' });
    expect(body.counts).toEqual({ onSale: 1, reserved: 1, sold: 1, purchased: 0 });
    expect(JSON.stringify(mine.body)).not.toContain('passwordHash');

    expect((await get(app, '/me', buyer.cookie)).body.counts).toEqual({ onSale: 0, reserved: 0, sold: 0, purchased: 2 });
    expect((await request(app).get('/me')).status).toBe(401);
  });
});

describe('PATCH /me', () => {
  it('[AC-MP-06, 07] 닉네임을 바꾸면 다른 사람에게 보이는 곳에도 새 닉네임이 나온다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'before');
    const productId = await createProduct(app, user.cookie, '의자');
    const res = await patch(app, '/me', user.cookie).send({ nickname: '  새  이름 ' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, nickname: '새 이름', email: 'before@example.com' });
    expect((await request(app).get(`/products/${productId}`)).body.product.seller.nickname).toBe('새 이름');
  });

  it('[AC-MP-06] 대소문자만 바꾸는 것은 되고, 남이 쓰는 닉네임은 409 — 대소문자가 달라도', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'kim');
    await signup(app, 'Lee');
    expect((await patch(app, '/me', user.cookie).send({ nickname: 'KIM' })).body.user.nickname).toBe('KIM');
    const taken = await patch(app, '/me', user.cookie).send({ nickname: 'lee' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({ code: 'NICKNAME_TAKEN', fields: { nickname: '이미 사용 중인 닉네임이에요' } });
    const invalid = await patch(app, '/me', user.cookie).send({ nickname: '관리자' });
    expect([invalid.status, invalid.body.error.fields.nickname]).toEqual([400, '사용할 수 없는 닉네임이에요']);
  });

  it('[AC-MP-12] 본문의 id · email · tokenVersion · isDemo는 무시한다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const res = await patch(app, '/me', user.cookie).send({ id: 'x', email: 'evil@example.com', tokenVersion: 99, isDemo: true, passwordHash: 'x' });
    expect(res.status).toBe(200);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ email: 'user@example.com', tokenVersion: 0, isDemo: false });
    expect(row.passwordHash).not.toBe('x');
  });

  it('[AC-MP-08] 아바타는 내가 올린 업로드 id로 바꾸고, 임시 행은 사라진다. null이면 기본 이미지로', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const upload = await makeAvatar(user.id);
    const res = await patch(app, '/me', user.cookie).send({ avatarUploadId: upload.id });
    expect(res.body.user.avatarUrl).toBe(upload.url);
    expect(await db.upload.count()).toBe(0);
    // 같은 업로드를 두 번 쓸 수 없다
    expect((await patch(app, '/me', user.cookie).send({ avatarUploadId: upload.id })).status).toBe(400);
    expect((await patch(app, '/me', user.cookie).send({ avatarUploadId: null })).body.user.avatarUrl).toBeNull();
    // 생략하면 그대로
    await patch(app, '/me', user.cookie).send({ avatarUploadId: (await makeAvatar(user.id)).id });
    expect((await patch(app, '/me', user.cookie).send({ nickname: 'renamed' })).body.user.avatarUrl).not.toBeNull();
  });

  it('[AC-MP-08] 남의 업로드는 403, 상품용 · 만료된 · 없는 업로드는 400 — 주소를 직접 넣을 수 없다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const other = await signup(app, 'other');
    const cases: [string, number][] = [
      [(await makeAvatar(other.id)).id, 403],
      [(await makeAvatar(user.id, { kind: 'PRODUCT' })).id, 400],
      [(await makeAvatar(user.id, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })).id, 400],
      ['nope', 400],
    ];
    for (const [avatarUploadId, status] of cases) {
      expect((await patch(app, '/me', user.cookie).send({ avatarUploadId })).status).toBe(status);
    }
    const url = await patch(app, '/me', user.cookie).send({ avatarUrl: 'https://evil.example/a.png' });
    expect(url.body.user.avatarUrl).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).avatarUrl).toBeNull();
  });

  it('[AC-LI-19] 둘러보기 계정은 닉네임 · 아바타 · 비밀번호를 바꿀 수 없다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'shared');
    await db.user.update({ where: { id: user.id }, data: { isDemo: true } });
    const profile = await patch(app, '/me', user.cookie).send({ nickname: 'mine' });
    expect([profile.status, profile.body.error.code]).toEqual([403, 'DEMO_RESTRICTED']);
    const pw = await patch(app, '/me/password', user.cookie).send(password(PASSWORD, 'battery staple'));
    expect([pw.status, pw.body.error.code]).toEqual([403, 'DEMO_RESTRICTED']);
    expect((await login(app, 'shared', PASSWORD)).status).toBe(200);
  });
});

describe('PATCH /me/password', () => {
  it('[AC-MP-09] 바꾸면 이 세션은 새 쿠키로 이어지고, 다른 세션과 실시간 연결은 무효가 된다', async () => {
    const ctx = createTestApp();
    const { app } = ctx;
    const user = await signup(app, 'user');
    const otherDevice = sessionCookie(await login(app, 'user', PASSWORD));

    const res = await patch(app, '/me/password', user.cookie).send(password(PASSWORD, 'battery staple'));
    expect(res.status).toBe(204);
    const renewed = sessionCookie(res);
    expect((await get(app, '/me', renewed)).status).toBe(200);
    // 바꾸기 전의 쿠키는 어느 기기 것이든 쓸 수 없다
    expect((await get(app, '/me', user.cookie)).status).toBe(401);
    expect((await get(app, '/me', otherDevice)).status).toBe(401);
    expect(ctx.events.userRevoked).toEqual([{ userId: user.id }]);

    expect((await login(app, 'user', PASSWORD)).status).toBe(401);
    expect((await login(app, 'user', 'battery staple')).status).toBe(200);
  });

  it('[AC-MP-09] 현재 비밀번호가 틀리면 400 WRONG_PASSWORD, 새 비밀번호 규칙 위반은 칸별로 알린다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const wrong = await patch(app, '/me/password', user.cookie).send(password('not my password', 'battery staple'));
    expect([wrong.status, wrong.body.error.code, wrong.body.error.fields]).toEqual([
      400,
      'WRONG_PASSWORD',
      { currentPassword: '비밀번호가 맞지 않아요' },
    ]);

    const fields = async (body: Record<string, unknown>) =>
      (await patch(app, '/me/password', user.cookie).send(body)).body.error.fields as Record<string, string>;
    expect(await fields(password(PASSWORD, PASSWORD))).toEqual({ newPassword: '지금 쓰는 비밀번호와 달라야 해요' });
    expect(await fields(password(PASSWORD, 'short'))).toEqual({ newPassword: '8자 이상 입력해 주세요' });
    expect(await fields({ ...password(PASSWORD, 'battery staple'), newPasswordConfirm: 'different!' })).toEqual({
      newPasswordConfirm: '비밀번호가 일치하지 않아요',
    });
    expect(await fields(password(PASSWORD, 'user@example.com'))).toEqual({
      newPassword: '이메일이나 닉네임과 같은 비밀번호는 쓸 수 없어요',
    });
    expect(await fields(password(PASSWORD, 'iloveyou1'))).toEqual({
      newPassword: '너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요',
    });
    // 아무것도 바뀌지 않았다
    expect((await get(app, '/me', user.cookie)).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(0);
  });

  it('동시에 두 번 바꾸면 하나만 성공하고 버전은 한 번만 오른다', async () => {
    const { app } = createTestApp();
    const user = await signup(app, 'user');
    const results = await Promise.all([
      patch(app, '/me/password', user.cookie).send(password(PASSWORD, 'battery staple')),
      patch(app, '/me/password', user.cookie).send(password(PASSWORD, 'another secret')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 401]);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(1);
  });
});

describe('GET /me/products', () => {
  it('[AC-MP-02, 03] 상태별로 내 상품만, 삭제된 것은 빼고, 거래완료에는 구매자가 실린다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const chair = await createProduct(app, seller.cookie, '의자');
    const desk = await createProduct(app, seller.cookie, '책상');
    const lamp = await createProduct(app, seller.cookie, '조명');
    const gone = await createProduct(app, seller.cookie, '지운 것');
    await createProduct(app, buyer.cookie, '남의 것');
    await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId: chair });
    await setStatus(app, seller.cookie, chair, { status: 'SOLD', buyerId: buyer.id });
    // 구매자를 정하지 않은 거래완료
    await setStatus(app, seller.cookie, desk, { status: 'SOLD' });
    await request(app).delete(`/products/${gone}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);

    const onSale = myProductPageSchema.parse((await get(app, '/me/products?status=ON_SALE', seller.cookie)).body);
    expect(onSale.items.map((item) => [item.id, item.buyer])).toEqual([[lamp, null]]);

    const sold = myProductPageSchema.parse((await get(app, '/me/products?status=SOLD', seller.cookie)).body);
    expect(sold.items.map((item) => [item.title, item.buyer?.nickname ?? null, item.chatRoomCount])).toEqual([
      ['책상', null, 0],
      ['의자', 'buyer', 1],
    ]);
    expect(JSON.stringify(sold)).not.toContain('@example.com');

    expect((await get(app, '/me/products', seller.cookie)).status).toBe(400);
    expect((await request(app).get('/me/products?status=ON_SALE')).status).toBe(401);
  });

  it('커서로 이어 받는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    for (let i = 0; i < 5; i += 1) await createProduct(app, seller.cookie, `물건 ${i}`);
    const first = (await get(app, '/me/products?status=ON_SALE&limit=2', seller.cookie)).body;
    const second = (await get(app, `/me/products?status=ON_SALE&limit=2&cursor=${first.nextCursor}`, seller.cookie)).body;
    const third = (await get(app, `/me/products?status=ON_SALE&limit=2&cursor=${second.nextCursor}`, seller.cookie)).body;
    const titles = [...first.items, ...second.items, ...third.items].map((item: { title: string }) => item.title);
    expect(titles).toEqual(['물건 4', '물건 3', '물건 2', '물건 1', '물건 0']);
    expect(third.nextCursor).toBeNull();
  });
});

describe('GET /me/purchases', () => {
  it('[AC-MP-04] 내가 구매자로 지정된 거래만, 거래 시점 가격으로, 삭제된 상품도 남는다', async () => {
    const { app } = createTestApp();
    const seller = await signup(app, 'seller');
    const buyer = await signup(app, 'buyer');
    const other = await signup(app, 'other');
    const chair = await createProduct(app, seller.cookie, '의자');
    const desk = await createProduct(app, seller.cookie, '책상');
    const lamp = await createProduct(app, seller.cookie, '조명');
    for (const id of [chair, desk]) await post(app, '/chat-rooms').set('Cookie', buyer.cookie).send({ productId: id });
    await post(app, '/chat-rooms').set('Cookie', other.cookie).send({ productId: lamp });
    await setStatus(app, seller.cookie, chair, { status: 'SOLD', buyerId: buyer.id });
    await setStatus(app, seller.cookie, desk, { status: 'SOLD', buyerId: buyer.id });
    await setStatus(app, seller.cookie, lamp, { status: 'SOLD', buyerId: other.id });
    // 거래 뒤에 가격을 고치고, 글을 지웠다
    await patch(app, `/products/${chair}`, seller.cookie).send({ price: 1 });
    await request(app).delete(`/products/${desk}`).set('Origin', ORIGIN).set('Cookie', seller.cookie);

    const page = purchasePageSchema.parse((await get(app, '/me/purchases', buyer.cookie)).body);
    expect(page.items.map((item) => [item.title, item.soldPrice, item.deleted, item.seller.nickname])).toEqual([
      ['책상', 15000, true, 'seller'],
      ['의자', 15000, false, 'seller'],
    ]);
    expect(page.nextCursor).toBeNull();

    // 거래완료를 되돌리면 구매 내역에서 빠진다 [AC-PD-06]
    await setStatus(app, seller.cookie, chair, { status: 'ON_SALE' });
    expect((await get(app, '/me/purchases', buyer.cookie)).body.items.map((item: { title: string }) => item.title)).toEqual(['책상']);
    expect((await get(app, '/me/purchases', seller.cookie)).body.items).toEqual([]);
  });
});

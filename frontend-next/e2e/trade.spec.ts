import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createProduct, logIn, newAccount, newUser, sendMessage, signUp } from './helpers';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

// 개요 2.1의 두 시나리오 — 이 두 줄이 끝까지 끊기지 않으면 1차 범위가 동작하는 것이다
test('판매자와 구매자가 가입부터 거래완료까지 끊기지 않고 간다', async ({ browser }) => {
  const seller = newAccount('seller');
  const buyer = newAccount('buyer');
  const s = await newUser(browser);
  const b = await newUser(browser);

  await test.step('판매자: 가입하고 사진 두 장으로 물건을 올린다', async () => {
    await signUp(s.page, seller);
  });
  const title = `원목 스툴 ${seller.nickname}`;
  const productId = await createProduct(s.page, {
    title,
    price: '15000',
    description: '직접 써 보고 올리는 물건이에요.\n상태 좋아요.',
    photos: [fixture('photo-landscape.jpg'), fixture('photo-portrait.jpg')],
  });
  await expect(s.page.getByRole('heading', { name: title })).toBeVisible();
  await expect(s.page.getByText('15,000원')).toBeVisible();
  await expect(s.page.getByText('1 / 2')).toBeVisible();

  await test.step('구매자: 가입하면 목록 맨 위에 그 물건이 있고, 사진이 실제로 열린다', async () => {
    await signUp(b.page, buyer);
    const card = b.page.getByRole('link', { name: new RegExp(title) }).first();
    await expect(card).toBeVisible();
    const src = await card.locator('img').getAttribute('src');
    expect(src).toBeTruthy();
    expect((await b.page.request.get(src ?? '')).status()).toBe(200);
  });

  let roomUrl = '';
  await test.step('구매자: 상세에서 채팅을 열고 첫 메시지를 보낸다', async () => {
    await b.page.goto(`/products/${productId}`);
    await b.page.getByRole('button', { name: '채팅하기' }).click();
    await expect(b.page).toHaveURL(/\/chats\/c[a-z0-9]+$/);
    roomUrl = new URL(b.page.url()).pathname;
    await sendMessage(b.page, '안녕하세요! 아직 판매 중인가요?');
  });

  await test.step('판매자: 탭에 읽지 않은 대화 1개가 뜨고, 목록에서 방으로 들어가 답한다', async () => {
    await s.page.goto('/');
    await expect(s.page.getByRole('navigation', { name: '주요 메뉴' }).getByText('읽지 않은 대화 1개')).toBeAttached();
    await s.page.goto('/chats');
    await s.page.getByRole('link', { name: new RegExp(buyer.nickname) }).click();
    await expect(s.page).toHaveURL(roomUrl);
    await expect(s.page.getByRole('log').getByText('안녕하세요! 아직 판매 중인가요?')).toBeVisible();
    await sendMessage(s.page, '네, 판매 중이에요 😊');
  });

  await test.step('구매자: 새로 고치지 않아도 답이 도착하고, 내 메시지에 "읽음"이 붙는다', async () => {
    await expect(b.page.getByRole('log').getByText('네, 판매 중이에요 😊')).toBeVisible();
    await expect(b.page.getByRole('log').getByText('읽음')).toBeVisible();
    await sendMessage(b.page, '오늘 저녁 7시\n역 앞에서 뵐게요');
  });

  await test.step('판매자: 열어 둔 방에 여러 줄 메시지가 그대로 도착한다', async () => {
    await expect(s.page.getByRole('log').getByText('오늘 저녁 7시')).toBeVisible();
  });

  await test.step('판매자: 거래완료로 바꾸며 구매자를 지정한다', async () => {
    await s.page.goto(`/products/${productId}`);
    await s.page.getByLabel('거래 상태').selectOption({ label: '거래완료' });
    await expect(s.page.getByRole('heading', { name: '누구와 거래했나요?' })).toBeVisible();
    await s.page.getByRole('button', { name: buyer.nickname }).click();
    await expect(s.page.getByRole('heading', { name: '누구와 거래했나요?' })).toHaveCount(0);
    await expect(s.page.getByLabel('거래 상태')).toHaveValue('SOLD');
  });

  await test.step('구매자: 구매 내역에 그 물건이 있고, 대화하던 방은 계속 들어갈 수 있다', async () => {
    await b.page.goto('/me?status=PURCHASED');
    await expect(b.page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await b.page.goto(`/products/${productId}`);
    await expect(b.page.getByRole('button', { name: '채팅 이어하기' })).toBeVisible();
  });

  await test.step('다른 사람에게는 채팅 버튼이 [거래완료]로 보이고, 누르면 이유를 알린다', async () => {
    const guest = await newUser(browser);
    await guest.page.goto(`/products/${productId}`);
    const blocked = guest.page.getByRole('button', { name: '거래완료' });
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled 버튼은 눌려야 이유를 들을 수 있다 [AC-PD-18]
    await blocked.click({ force: true });
    await expect(guest.page.getByText('거래가 완료된 물건이에요')).toBeVisible();
    expect(guest.problems).toEqual([]);
    await guest.context.close();
  });

  expect(s.problems).toEqual([]);
  expect(b.problems).toEqual([]);
  await s.context.close();
  await b.context.close();
});

test('판매자가 물건을 고치고 내리면 목록에서 사라지고, 대화하던 방은 열람만 된다', async ({ browser }) => {
  const seller = newAccount('seller');
  const buyer = newAccount('buyer');
  const s = await newUser(browser);
  const b = await newUser(browser);
  await signUp(s.page, seller);
  const title = `접이식 의자 ${seller.nickname}`;
  const productId = await createProduct(s.page, {
    title,
    price: '20000',
    description: '',
    photos: [fixture('photo-landscape.jpg')],
  });

  await test.step('수정: 제목과 가격을 바꾸면 상세에 반영된다', async () => {
    await s.page.goto(`/products/${productId}/edit`);
    await expect(s.page.getByLabel('제목')).toHaveValue(title);
    await s.page.getByLabel('제목').fill(`${title} (가격 내림)`);
    await s.page.getByLabel('가격').fill('12000');
    await s.page.getByRole('button', { name: '저장하기' }).click();
    await expect(s.page).toHaveURL(`/products/${productId}`);
    await expect(s.page.getByRole('heading', { name: `${title} (가격 내림)` })).toBeVisible();
    await expect(s.page.getByText('12,000원')).toBeVisible();
  });

  let roomUrl = '';
  await test.step('구매자가 대화를 시작한다', async () => {
    await signUp(b.page, buyer);
    await b.page.goto(`/products/${productId}`);
    await b.page.getByRole('button', { name: '채팅하기' }).click();
    await expect(b.page).toHaveURL(/\/chats\/c[a-z0-9]+$/);
    roomUrl = new URL(b.page.url()).pathname;
    await sendMessage(b.page, '구매하고 싶어요');
  });

  await test.step('삭제: 확인 창을 거쳐 내리면 홈으로 가고, 주소로 들어가도 없다', async () => {
    await s.page.goto(`/products/${productId}`);
    await s.page.getByRole('button', { name: '삭제' }).click();
    const dialog = s.page.getByRole('alertdialog');
    await expect(dialog.getByText(/대화 중인 채팅 1개/)).toBeVisible();
    await dialog.getByRole('button', { name: '삭제' }).click();
    await expect(s.page).toHaveURL('/');
    await expect(s.page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
    const gone = await s.page.goto(`/products/${productId}`);
    expect(gone?.status()).toBe(404);
  });

  await test.step('구매자: 방은 남아 지난 대화를 볼 수 있지만 더 보낼 수는 없다', async () => {
    await b.page.goto(roomUrl);
    await expect(b.page.getByRole('log').getByText('구매하고 싶어요')).toBeVisible();
    await expect(b.page.getByPlaceholder('메시지 보내기')).toHaveCount(0);
  });

  await s.context.close();
  await b.context.close();
});

test('프로필과 비밀번호를 바꾸면 바로 반영되고, 옛 비밀번호로는 들어갈 수 없다', async ({ browser }) => {
  const account = newAccount('seller');
  const { page, context, problems } = await newUser(browser);
  await signUp(page, account);

  await test.step('닉네임과 프로필 사진을 바꾼다', async () => {
    await page.goto('/me/edit');
    await page.locator('input[type=file]').setInputFiles(fixture('avatar.png'));
    await expect(page.getByRole('button', { name: '기본 이미지로' })).toBeVisible();
    await page.getByLabel('닉네임').fill(`${account.nickname}님`);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL('/me');
    await expect(page.getByText(`${account.nickname}님`, { exact: true })).toBeVisible();
  });

  const nextPassword = `${account.password} 2`;
  await test.step('비밀번호를 바꿔도 이 탭은 로그인된 채로 남는다', async () => {
    await page.goto('/me/password');
    await page.getByLabel('현재 비밀번호').fill(account.password);
    await page.getByLabel('새 비밀번호', { exact: true }).fill(nextPassword);
    await page.getByLabel('새 비밀번호 확인').fill(nextPassword);
    await page.getByRole('button', { name: '비밀번호 바꾸기' }).click();
    await expect(page).toHaveURL('/me');
    await page.reload();
    await expect(page.getByText(`${account.nickname}님`, { exact: true })).toBeVisible();
  });

  await test.step('로그아웃하면 보호된 화면이 로그인으로 보낸다', async () => {
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL('/');
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login/);
  });

  await test.step('옛 비밀번호는 거절되고 새 비밀번호로 들어간다', async () => {
    await logIn(page, account.email, account.password);
    await expect(page.getByRole('alert').getByText('이메일 또는 비밀번호가 맞지 않아요')).toBeVisible();
    await page.getByLabel('비밀번호', { exact: true }).fill(nextPassword);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  expect(problems).toEqual([]);
  await context.close();
});

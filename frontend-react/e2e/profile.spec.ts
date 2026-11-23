import { expect, test } from '@playwright/test';
import { createProduct, fixture, newAccount, newUser, signUp } from './helpers';

test('상세의 판매자를 누르면 그 사람이 올린 물건만 보이고, 로그인 없이도 열린다', async ({ browser }) => {
  const seller = newAccount('seller');
  const other = newAccount('seller');
  const s = await newUser(browser);
  const o = await newUser(browser);
  const guest = await newUser(browser);

  await signUp(s.page, seller);
  const mine = `프로필 물건 ${seller.nickname}`;
  const productId = await createProduct(s.page, { title: mine, price: '7000', description: '', photos: [fixture('photo-landscape.jpg')] });
  await signUp(o.page, other);
  const theirs = `남의 물건 ${other.nickname}`;
  await createProduct(o.page, { title: theirs, price: '9000', description: '', photos: [fixture('photo-portrait.jpg')] });

  await test.step('손님: 상세 → 판매자 → 프로필 [AC-UP-04]', async () => {
    await guest.page.goto(`/products/${productId}`);
    await guest.page.getByRole('link', { name: new RegExp(`판매자\\s*${seller.nickname}`) }).click();
    await expect(guest.page).toHaveURL(/\/users\/c[a-z0-9]+$/);
    await expect(guest.page.getByRole('heading', { name: seller.nickname })).toBeVisible();
    await expect(guest.page.getByRole('link', { name: new RegExp(mine) })).toBeVisible();
    await expect(guest.page.getByText(theirs)).toHaveCount(0);
    // 손님에게는 고치는 길이 없다
    await expect(guest.page.getByRole('link', { name: '마이로 가기' })).toHaveCount(0);
    await expect(guest.page.getByText(seller.email)).toHaveCount(0);
  });

  await test.step('판매자: 거래완료로 바꾸면 개수가 옮겨 가고, 숨기면 빈 안내가 나온다 [AC-UP-08]', async () => {
    await s.page.goto(`/products/${productId}`);
    await s.page.getByLabel('거래 상태').selectOption({ label: '거래완료' });
    await s.page.getByRole('button', { name: '선택 안 함' }).click();
    await expect(s.page.getByLabel('거래 상태')).toHaveValue('SOLD');

    await guest.page.reload();
    const counts = guest.page.locator('dl');
    await expect(counts).toContainText('판매중0');
    await expect(counts).toContainText('거래완료1');
    await guest.page.getByLabel('거래완료 숨기기').check();
    await expect(guest.page).toHaveURL(/hideSold=1/);
    await expect(guest.page.getByText('거래 중인 물건이 없어요')).toBeVisible();
  });

  await test.step('본인이 보면 [마이로 가기]가 있다 [AC-UP-07]', async () => {
    await s.page.getByRole('link', { name: new RegExp(`판매자\\s*${seller.nickname}`) }).click();
    await s.page.getByRole('link', { name: '마이로 가기' }).click();
    await expect(s.page).toHaveURL('/me');
  });

  await test.step('없는 사용자는 찾을 수 없다는 화면이다', async () => {
    const response = await guest.page.goto('/users/nobody');
    expect(response?.status()).toBe(404);
  });

  expect([...s.problems, ...o.problems, ...guest.problems]).toEqual([]);
  await Promise.all([s.context.close(), o.context.close(), guest.context.close()]);
});

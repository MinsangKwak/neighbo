import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createProduct, newAccount, newUser, signUp } from './helpers';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

test('관심을 누르면 관심 목록에 모이고, 끄면 빠진다. 판매자는 개수만 본다', async ({ browser }) => {
  const seller = newAccount('seller');
  const buyer = newAccount('buyer');
  const s = await newUser(browser);
  const b = await newUser(browser);
  const guest = await newUser(browser);

  await signUp(s.page, seller);
  const title = `관심 물건 ${seller.nickname}`;
  const productId = await createProduct(s.page, { title, price: '12000', description: '', photos: [fixture('photo-landscape.jpg')] });

  await test.step('손님: 누르면 로그인으로 간다', async () => {
    await guest.page.goto(`/products/${productId}`);
    await guest.page.getByRole('button', { name: '관심 0' }).click();
    await expect(guest.page).toHaveURL(/\/login\?next=/);
  });

  await test.step('구매자: 처음에는 관심 목록이 비어 있다', async () => {
    await signUp(b.page, buyer);
    await b.page.goto('/me');
    await b.page.getByRole('link', { name: '관심 목록' }).click();
    await expect(b.page).toHaveURL('/me/favorites');
    await expect(b.page.getByText('관심 목록이 비어 있어요')).toBeVisible();
  });

  await test.step('구매자: 켜면 눌린 상태가 되고 새로 열어도 남는다', async () => {
    await b.page.goto(`/products/${productId}`);
    await b.page.getByRole('button', { name: '관심 0' }).click();
    const on = b.page.getByRole('button', { name: '관심 1' });
    await expect(on).toHaveAttribute('aria-pressed', 'true');
    await b.page.reload();
    await expect(on).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('구매자: 관심 목록에 그 물건이 있다', async () => {
    await b.page.goto('/me/favorites');
    await expect(b.page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  });

  await test.step('판매자: 자기 물건에는 버튼이 없고 개수만 보인다', async () => {
    await s.page.goto(`/products/${productId}`);
    await expect(s.page.getByText('관심 1', { exact: true })).toBeVisible();
    await expect(s.page.getByRole('button', { name: /^관심/ })).toHaveCount(0);
  });

  await test.step('구매자: 끄면 목록에서 빠진다', async () => {
    await b.page.getByRole('link', { name: new RegExp(title) }).click();
    await b.page.getByRole('button', { name: '관심 1' }).click();
    await expect(b.page.getByRole('button', { name: '관심 0' })).toHaveAttribute('aria-pressed', 'false');
    await b.page.goBack();
    await expect(b.page).toHaveURL('/me/favorites');
    await expect(b.page.getByText('관심 목록이 비어 있어요')).toBeVisible();
  });

  expect([...s.problems, ...b.problems, ...guest.problems]).toEqual([]);
  await Promise.all([s.context.close(), b.context.close(), guest.context.close()]);
});

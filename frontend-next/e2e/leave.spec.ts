import { expect, test } from '@playwright/test';
import { newAccount, newUser, signUp } from './helpers';

// 앱 안 이동의 이탈 확인 — 실제 라우터와 Link가 붙은 화면에서 가로채기가 이동보다 먼저 서는지 본다 [AC-MP-10, AC-PC-04]
test('프로필을 고친 채 뒤로 · 앱 안 링크로 나가면 먼저 묻는다', async ({ browser }) => {
  const account = newAccount('seller');
  const { page, problems } = await newUser(browser);
  await signUp(page, account);
  await page.goto('/me');
  await page.goto('/me/edit');

  const nickname = page.getByLabel('닉네임');
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' });

  await test.step('고친 내용이 없으면 묻지 않고 간다', async () => {
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL('/me');
    await page.goto('/me/edit');
  });

  await nickname.fill(`${account.nickname.slice(0, 8)}고침`);

  await test.step('뒤로 버튼 → [계속 작성]이면 입력이 그대로 남는다', async () => {
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '계속 작성' }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL('/me/edit');
    await expect(nickname).toHaveValue(`${account.nickname.slice(0, 8)}고침`);
  });

  await test.step('앱 안 링크 → 브라우저 이동 대신 확인 창, [나가기]면 그 주소로', async () => {
    // 폼 화면에는 다른 화면으로 가는 링크가 없다 — 화면에 붙은 링크와 같은 a를 하나 더한다
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/chats';
      link.textContent = '채팅으로';
      document.body.append(link);
    });
    await page.getByRole('link', { name: '채팅으로' }).click();
    await expect(confirm).toBeVisible();
    await expect(page).toHaveURL('/me/edit');
    await confirm.getByRole('button', { name: '나가기' }).click();
    await expect(page).toHaveURL('/chats');
  });

  expect(problems).toEqual([]);
});

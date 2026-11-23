import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';

// 테스트에 쓰는 사진 파일
export const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

export interface Account {
  email: string;
  password: string;
  nickname: string;
}

// 실행마다 다른 계정을 만든다 — 같은 DB로 여러 번 돌려도 겹치지 않게
export function newAccount(role: string): Account {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return {
    email: `${role}-${stamp}@example.com`,
    password: `correct horse ${stamp}`,
    // 닉네임은 2~12자
    nickname: `${role === 'seller' ? '판매' : '구매'}${stamp.slice(-6)}`,
  };
}

export async function newUser(browser: Browser) {
  // 사람마다 다른 주소에서 온 것으로 둔다 — 인증 경로는 주소당 분당 10회로 제한한다 [AC-CM-32]
  // 한 번의 실행이 만드는 계정이 그보다 많아, 같은 주소로 두면 뒤쪽 테스트의 가입이 막힌다
  const address = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  const context = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': address } });
  const page = await context.newPage();
  // 서버가 그린 화면은 스크립트가 붙기 전에 눌러도 반응이 없다 — 문서를 새로 열 때마다 준비 표시를 기다린다
  // (CI의 첫 테스트가 이 틈에 걸려 실패했다. 사람은 이만큼 빨리 누르지 못한다)
  const goto = page.goto.bind(page);
  page.goto = async (url, options) => {
    const response = await goto(url, options);
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
    return response;
  };
  const reload = page.reload.bind(page);
  page.reload = async (options) => {
    const response = await reload(options);
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
    return response;
  };
  // 화면이 스스로 낸 오류를 모은다. 의도한 실패(잘못된 비밀번호, 지워진 상품)는 각 테스트가 걸러 낸다
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return { context, page, problems };
}

export async function signUp(page: Page, account: Account) {
  await page.goto('/signup');
  await page.getByLabel('이메일').fill(account.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(account.password);
  await page.getByLabel('비밀번호 확인').fill(account.password);
  await page.getByLabel('닉네임').fill(account.nickname);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page).toHaveURL('/');
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

export async function createProduct(page: Page, input: { title: string; price: string; description: string; photos: string[] }) {
  await page.goto('/products/new');
  await page.locator('input[type=file]').setInputFiles(input.photos);
  // 사진은 고르는 즉시 올라간다. 다 올라간 뒤에 등록할 수 있다
  await expect(page.getByText(`${input.photos.length}/10`)).toBeVisible();
  await expect(page.getByText(/사진 올리는 중/)).toHaveCount(0, { timeout: 30_000 });
  await page.getByLabel('제목').fill(input.title);
  await page.getByLabel('가격').fill(input.price);
  await page.getByLabel('설명').fill(input.description);
  await page.getByRole('button', { name: '등록하기' }).click();
  await expect(page).toHaveURL(/\/products\/c[a-z0-9]+$/);
  return page.url().split('/').pop() ?? '';
}

export async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder('메시지 보내기').fill(text);
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.getByRole('log').getByText(text.split('\n')[0] ?? text)).toBeVisible();
}

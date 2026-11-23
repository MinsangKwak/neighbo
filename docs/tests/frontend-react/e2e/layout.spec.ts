import { expect, test, type Page } from '@playwright/test';
import { newAccount, newUser, signUp } from './helpers';

// 보이는 글자와 접근성 이름이 다르면 음성 명령 사용자는 보이는 대로 말해도 누를 수 없다 (WCAG 2.5.3)
// aria-label을 단 버튼 · 링크는 보이는 글자를 이름 안에 담아야 한다
async function labelMismatches(page: Page) {
  return page.evaluate(() => {
    const squash = (text: string) => text.replace(/\s+/g, '').toLowerCase();
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button[aria-label], a[aria-label]')) {
      // 글자가 아닌 기호(←, +, ×, ‹)만 보이는 버튼은 이름이 따로 필요하다 — 대상이 아니다
      const visible = squash(
        [...el.querySelectorAll('*'), el]
          .flatMap((node) => [...node.childNodes])
          .filter((node) => node.nodeType === Node.TEXT_NODE && !node.parentElement?.closest('[aria-hidden="true"], .sr-only'))
          .map((node) => node.textContent ?? '')
          .join(''),
      );
      if (visible === '' || !/[가-힣a-z0-9]/.test(visible)) continue;
      const name = squash(el.getAttribute('aria-label') ?? '');
      if (!name.includes(visible)) found.push(`보이는 글자 "${visible}" / 이름 "${name}"`);
    }
    return found;
  });
}

// 좁은 화면에서 글자가 여러 줄로 꺾인 버튼 — 글자가 놓인 줄의 수를 센다
async function wrappedButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[class*="rounded-lg"]')]
      .filter((el) => {
        const text = (el.textContent ?? '').trim();
        // 짧은 이름표만 본다. 긴 문장은 줄바꿈이 정상이다
        if (text.length === 0 || text.length > 12 || el.offsetParent === null) return false;
        // 글자 노드의 상자만 잰다. 요소 상자를 섞으면 줄이 하나여도 높이가 달라 여러 줄로 보인다
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const lines = new Set<number>();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          // 화면에 보이지 않는 보조 글자는 줄을 차지하지 않는다
          if (node.parentElement?.closest('.sr-only') != null) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0) lines.add(Math.round((rect.top + rect.height / 2) / 8));
          }
        }
        return lines.size > 1;
      })
      .map((el) => (el.textContent ?? '').trim()),
  );
}

test('가장 좁은 폭(360px)에서 버튼 글자가 꺾이지 않고, 이름이 보이는 글자와 맞는다', async ({ browser }) => {
  const { page, context } = await newUser(browser);
  await page.setViewportSize({ width: 360, height: 740 });
  const account = newAccount('seller');

  for (const path of ['/', '/login', '/signup']) {
    await page.goto(path);
    expect(await wrappedButtons(page), `${path}의 꺾인 버튼`).toEqual([]);
    expect(await labelMismatches(page), `${path}의 이름 불일치`).toEqual([]);
  }
  await signUp(page, account);
  for (const path of ['/products/new', '/me', '/me/edit', '/me/password', '/chats']) {
    await page.goto(path);
    expect(await wrappedButtons(page), `${path}의 꺾인 버튼`).toEqual([]);
    expect(await labelMismatches(page), `${path}의 이름 불일치`).toEqual([]);
  }
  await context.close();
});

test('넓은 화면에서도 [물건 올리기] 버튼이 앱 칸 안에 있다', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  const page = await context.newPage();
  await page.goto('/');
  const button = await page.getByRole('link', { name: '물건 올리기' }).boundingBox();
  const column = await page.getByRole('navigation', { name: '주요 메뉴' }).boundingBox();
  expect(button).not.toBeNull();
  expect(column).not.toBeNull();
  if (button === null || column === null) return;
  expect(button.x).toBeGreaterThanOrEqual(column.x);
  expect(button.x + button.width).toBeLessThanOrEqual(column.x + column.width);
  await context.close();
});

test('어느 화면도 없는 파일을 요청하지 않는다 (파비콘 포함)', async ({ page }) => {
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) missing.push(response.url());
  });
  for (const path of ['/', '/login', '/signup']) await page.goto(path);
  expect((await page.request.get('/icon.svg')).status()).toBe(200);
  expect(missing).toEqual([]);
});

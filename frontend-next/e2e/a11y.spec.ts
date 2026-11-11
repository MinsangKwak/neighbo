import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createProduct, fixture, newAccount, newUser, sendMessage, signUp } from './helpers';

// 자동 검사가 잡는 것(명암비 · 이름 없는 조작 요소 · 레이블 · 역할 · 제목 순서)을 모든 화면에서 0으로 둔다
// 키보드 흐름과 포커스 이동은 자동 검사가 보지 못한다 — 다른 E2E가 직접 확인한다
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  return result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')} — ${node.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
  );
}

test('[AC-CM-40, AC-CM-44, AC-CM-46] 모든 화면이 접근성 자동 검사를 통과한다', async ({ browser }) => {
  const seller = newAccount('seller');
  const buyer = newAccount('buyer');
  const guest = await newUser(browser);
  const s = await newUser(browser);
  const b = await newUser(browser);
  const found: Record<string, string[]> = {};
  const check = async (name: string, page: Page) => {
    // 뼈대 화면이 아니라 다 그려진 화면을 본다
    await expect(page.getByRole('heading', { level: 1 }).first()).not.toHaveText('불러오는 중');
    const list = await violations(page);
    if (list.length > 0) found[name] = list;
  };

  await signUp(s.page, seller);
  const title = `접근성 확인 ${seller.nickname}`;
  const productId = await createProduct(s.page, { title, price: '12000', description: '설명', photos: [fixture('photo-landscape.jpg')] });
  await signUp(b.page, buyer);

  await test.step('손님이 보는 화면', async () => {
    for (const path of ['/', '/login', '/signup', '/search', `/search?q=${encodeURIComponent('접근성')}`, `/products/${productId}`, `/users/nobody`]) {
      await guest.page.goto(path);
      await check(`손님 ${path}`, guest.page);
    }
    // 틀린 값으로 제출한 뒤의 오류 표시
    await guest.page.goto('/signup');
    await guest.page.getByRole('button', { name: '가입하기' }).click();
    await check('손님 /signup (오류 표시)', guest.page);
  });

  await test.step('구매자: 상세 · 사진 뷰어 · 채팅방 · 목록', async () => {
    const page = b.page;
    await page.goto(`/products/${productId}`);
    await page.getByRole('button', { name: '관심 0' }).click();
    await check('구매자 상세 (관심 누름)', page);
    await page.getByRole('button', { name: '사진 1 크게 보기' }).click();
    await check('구매자 사진 뷰어', page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '채팅하기' }).click();
    await expect(page).toHaveURL(/\/chats\/c[a-z0-9]+$/);
    await check('구매자 채팅방 (빈 방)', page);
    await sendMessage(page, '안녕하세요');
    await check('구매자 채팅방 (메시지 있음)', page);
    for (const path of ['/chats', '/me', '/me?status=PURCHASED', '/me/favorites', '/me/edit', '/me/password']) {
      await page.goto(path);
      await check(`구매자 ${path}`, page);
    }
  });

  await test.step('판매자: 등록 · 수정 · 판매자 메뉴 · 확인 창 · 채팅 목록', async () => {
    const page = s.page;
    for (const path of ['/', '/products/new', `/products/${productId}/edit`, `/products/${productId}`, '/chats', `/chats?productId=${productId}`, '/me']) {
      await page.goto(path);
      await check(`판매자 ${path}`, page);
    }
    await page.goto(`/products/${productId}`);
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    await check('판매자 삭제 확인 창', page);
    await page.keyboard.press('Escape');
    await page.getByLabel('거래 상태').selectOption({ label: '거래완료' });
    await expect(page.getByRole('heading', { name: '누구와 거래했나요?' })).toBeVisible();
    await check('판매자 구매자 고르기', page);
  });

  expect(found).toEqual({});
  await Promise.all([guest.context.close(), s.context.close(), b.context.close()]);
});

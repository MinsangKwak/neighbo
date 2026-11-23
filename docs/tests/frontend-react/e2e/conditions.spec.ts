import { expect, test, type Page } from '@playwright/test';
import { createProduct, fixture, newAccount, newUser, signUp } from './helpers';

// 화면을 거치지 않고 상품을 만든다 — 목록을 채우는 것이 목적일 때
async function createByApi(page: Page, title: string): Promise<string> {
  const response = await page.request.post('/api/products', {
    headers: { Origin: new URL(page.url()).origin },
    data: { title, price: 1000, idempotencyKey: crypto.randomUUID() },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { product: { id: string } }).product.id;
}
const top = async (page: Page, locator: ReturnType<Page['locator']>) => (await locator.first().boundingBox())?.y ?? -1;

test('[AC-CM-23, AC-CM-05, AC-CM-41] 없는 주소는 404 화면, 로그인한 사람은 로그인 화면에 못 가고, 이동하면 제목으로 포커스가 간다', async ({
  browser,
}) => {
  const { page, context, problems } = await newUser(browser);

  const missing = await page.goto('/products/nothing-here');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '찾을 수 없어요' })).toBeVisible();
  await page.getByRole('link', { name: '홈으로' }).click();
  await expect(page).toHaveURL('/');

  await signUp(page, newAccount('seller'));
  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    await expect(page).toHaveURL('/');
  }

  // 화면이 바뀐 것을 스크린리더가 알 수 있게 제목으로 [AC-CM-41]
  await page.getByRole('link', { name: '마이' }).click();
  await expect(page).toHaveURL('/me');
  await expect(page.getByRole('heading', { level: 1, name: '마이' })).toBeFocused();
  // 같은 화면 안의 탭 전환(쿼리만 바뀜)은 포커스를 옮기지 않는다
  await page.getByRole('tab', { name: /예약중/ }).click();
  await expect(page).toHaveURL('/me?status=RESERVED');
  await expect(page.getByRole('tab', { name: /예약중/ })).toBeFocused();

  expect(problems.filter((line) => !line.includes('nothing-here'))).toEqual([]);
  await context.close();
});

test('[AC-PL-14, AC-PL-08, AC-CM-25, AC-LI-18] 올린 물건이 새로고침 없이 목록에 보이고, 뒤로 오면 보던 자리 그대로다. 요청은 같은 오리진으로만 간다', async ({
  browser,
  baseURL,
}) => {
  const { page, context } = await newUser(browser);
  const calls: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url());
  });
  const seller = newAccount('seller');
  await signUp(page, seller);
  for (let index = 0; index < 12; index += 1) await createByApi(page, `목록 채우기 ${index} ${seller.nickname}`);

  await page.goto('/');
  await expect(page.getByRole('link', { name: new RegExp(`목록 채우기 11 ${seller.nickname}`) })).toBeVisible();

  await test.step('홈에서 출발해 올리고 탭으로 돌아오면 맨 위에 있다 [AC-PL-14]', async () => {
    await page.getByRole('link', { name: '물건 올리기' }).click();
    await page.getByLabel('제목').fill(`방금 올린 물건 ${seller.nickname}`);
    await page.getByLabel('가격').fill('3000');
    await page.getByRole('button', { name: '등록하기' }).click();
    await expect(page).toHaveURL(/\/products\/c[a-z0-9]+$/);
    const loads: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest()) loads.push(request.url());
    });
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link').filter({ hasText: seller.nickname }).first()).toContainText('방금 올린 물건');
    // 문서를 새로 받지 않았다
    expect(loads).toEqual([]);
  });

  await test.step('아래로 내려 카드를 열었다 돌아오면 같은 자리다 [AC-PL-08, AC-CM-25]', async () => {
    const target = page.getByRole('link', { name: new RegExp(`목록 채우기 2 ${seller.nickname}`) });
    await target.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(200);
    await target.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('목록 채우기 2');
    await page.goBack();
    // 캐시에 있던 목록이 바로 보인다 — 뼈대 화면을 거치지 않는다
    await expect(target).toBeVisible();
    await expect(page.getByLabel('불러오는 중')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 80);
  });

  // 브라우저가 부른 API는 전부 프록시(/api)를 거친다. 실시간 연결만 백엔드로 바로 간다 [AC-LI-18]
  const api = calls.filter((url) => !url.includes('/socket.io/') && !url.includes('/_next/') && !url.includes('_rsc='));
  expect(api.length).toBeGreaterThan(0);
  expect(api.filter((url) => !url.startsWith(`${baseURL}/api/`))).toEqual([]);
  await context.close();
});

test('[AC-PD-10, AC-PD-21, AC-PD-23, AC-PL-07, AC-MP-01] 상세 · 마이 화면의 구성과 순서', async ({ browser }) => {
  const seller = newAccount('seller');
  const s = await newUser(browser);
  const guest = await newUser(browser);
  await signUp(s.page, seller);
  const title = `구성 확인 ${seller.nickname}`;
  const productId = await createProduct(s.page, {
    title,
    price: '45000',
    description: '설명 첫 줄',
    photos: [fixture('photo-landscape.jpg')],
  });

  await test.step('손님이 주소로 바로 연 상세 [AC-PD-10, 21, 23]', async () => {
    const page = guest.page;
    await page.goto(`/products/${productId}`);
    await expect(page).toHaveTitle(`${title} · neighbo`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

    // 사진 → 판매자 → 제목 → 설명 → 하단 바(가격 + 채팅하기)
    const order = [
      await top(page, page.getByRole('region', { name: '물건 사진' })),
      await top(page, page.getByRole('link', { name: new RegExp(`판매자\\s*${seller.nickname}`) })),
      await top(page, page.getByRole('heading', { level: 1 })),
      await top(page, page.getByText('설명 첫 줄')),
      await top(page, page.getByRole('contentinfo')),
    ];
    expect(order.every((y) => y >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(page.getByRole('contentinfo')).toContainText('45,000원');
    await expect(page.getByRole('contentinfo').getByRole('button', { name: '채팅하기' })).toBeVisible();

    // 링크를 공유했을 때 보일 것
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /45,000원/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\.webp$/);
    await expect(page.getByRole('button', { name: '공유' })).toBeVisible();

  });

  await test.step('링크를 새 탭으로 열어 앞선 기록이 없으면 뒤로는 홈으로 간다 [AC-PD-23]', async () => {
    // goto로 연 탭은 빈 문서가 기록에 남는다. 링크로 연 새 탭이라야 기록이 하나다
    const [popup] = await Promise.all([
      guest.context.waitForEvent('page'),
      guest.page.evaluate((url) => void window.open(url), `/products/${productId}`),
    ]);
    await popup.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
    expect(await popup.evaluate(() => window.history.length)).toBe(1);
    await popup.getByRole('button', { name: '뒤로' }).click();
    await expect(popup).toHaveURL('/');
    await popup.close();
    await guest.page.goto('/');
  });

  await test.step('손님이 [물건 올리기]를 누르면 로그인으로 간다 [AC-PL-07]', async () => {
    await guest.page.getByRole('link', { name: '물건 올리기' }).click();
    await expect(guest.page).toHaveURL('/login?next=%2Fproducts%2Fnew');
  });

  await test.step('마이: 프로필 → 수정 링크 → 탭 → 목록 → 로그아웃 [AC-MP-01]', async () => {
    const page = s.page;
    await page.goto('/me');
    const profile = page.getByRole('region', { name: '내 정보' });
    await expect(profile).toContainText(seller.nickname);
    await expect(profile).toContainText(seller.email);
    await expect(profile).toContainText(/\d{4}년 \d{1,2}월부터/);
    await expect(page.getByRole('tab')).toHaveText([/판매중\s*1/, /예약중\s*0/, /거래완료\s*0/, /구매\s*0/]);
    const order = [
      await top(page, profile),
      await top(page, page.getByRole('link', { name: '프로필 수정' })),
      await top(page, page.getByRole('tablist')),
      await top(page, page.getByRole('link', { name: new RegExp(title) })),
      await top(page, page.getByRole('button', { name: '로그아웃' })),
    ];
    expect(order.every((y) => y >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  expect([...s.problems, ...guest.problems]).toEqual([]);
  await Promise.all([s.context.close(), guest.context.close()]);
});

test('[AC-CH-20, AC-NT-15, AC-LI-13] 채팅방은 탭바 없이 입력창이 바닥에 붙고, 배지는 되풀이해 묻지 않으며, 로그아웃하면 보호 화면이 남지 않는다', async ({
  browser,
}) => {
  const seller = newAccount('seller');
  const buyer = newAccount('buyer');
  const s = await newUser(browser);
  const b = await newUser(browser);
  await signUp(s.page, seller);
  const productId = await createByApi(s.page, `채팅방 구성 ${seller.nickname}`);
  await signUp(b.page, buyer);
  const page = b.page;

  await test.step('홈에는 탭바가 있고, 채팅방에는 없다 [AC-CH-20]', async () => {
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await page.goto(`/products/${productId}`);
    await page.getByRole('button', { name: '채팅하기' }).click();
    await expect(page).toHaveURL(/\/chats\/c[a-z0-9]+$/);
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
    const box = await page.getByPlaceholder('메시지 보내기').boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    // 입력창이 화면 바닥에서 한 줄 높이 안쪽에 있다
    expect(height - ((box?.y ?? 0) + (box?.height ?? 0))).toBeLessThan(24);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });

  await test.step('배지 숫자는 화면을 열 때만 묻는다 — 가만히 두면 다시 묻지 않는다 [AC-NT-15]', async () => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await page.waitForTimeout(1500);
    let polls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/me/unread')) polls += 1;
    });
    await page.waitForTimeout(6000);
    expect(polls).toBe(0);
  });

  await test.step('보호 화면은 저장되지 않고, 로그아웃 뒤 뒤로 가도 보이지 않는다 [AC-LI-13]', async () => {
    const response = await page.goto('/me');
    expect(response?.headers()['cache-control']).toContain('no-store');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: '로그인' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/login\?next=%2Fme/);
    await expect(page.getByText(buyer.email)).toHaveCount(0);
  });

  await Promise.all([s.context.close(), b.context.close()]);
});

test('[AC-CM-48, AC-CM-49, AC-PX-13] 좁은 폭에서 가로로 넘치지 않고, 넓은 폭에서는 640px 가운데 정렬, 움직임 줄이기 설정을 따른다', async ({
  browser,
}) => {
  const { page, context } = await newUser(browser);
  const seller = newAccount('seller');
  await signUp(page, seller);
  const productId = await createByApi(page, `폭 확인 ${seller.nickname} 아주 긴 제목이 들어가도 넘치지 않아야 한다`);
  const pages = ['/', '/search?q=폭 확인', `/products/${productId}`, `/products/${productId}/edit`, '/products/new', '/chats', '/me', '/me/edit', '/me/password', '/me/favorites'];

  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of pages) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path}의 가로 넘침`).toBeLessThanOrEqual(360);
  }

  await test.step('삭제 확인 창은 좁은 폭에서 바닥에 붙는다 [AC-PX-13]', async () => {
    await page.goto(`/products/${productId}`);
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    const box = await dialog.boundingBox();
    expect(740 - ((box?.y ?? 0) + (box?.height ?? 0))).toBeLessThan(2);
    // [삭제]는 위험 색, [취소]는 아니다
    const colors = await dialog.getByRole('button').evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor));
    const danger = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.className = 'bg-danger';
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    expect(colors.filter((color) => color === danger)).toHaveLength(1);
    await page.keyboard.press('Escape');
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await test.step('넓은 폭: 본문은 640px 가운데, 확인 창은 화면 가운데 [AC-CM-48, AC-PX-13]', async () => {
    await page.goto(`/products/${productId}`);
    const column = await page.locator('body > div.mx-auto.min-h-dvh').boundingBox();
    expect(column?.width).toBe(640);
    expect(column?.x).toBe(320);
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    const box = await page.getByRole('alertdialog').boundingBox();
    const middle = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    expect(Math.abs(middle - 400)).toBeLessThan(4);
    await page.keyboard.press('Escape');
  });

  await test.step('움직임 줄이기를 켜면 애니메이션이 멈춘다 [AC-CM-49]', async () => {
    const duration = () =>
      page.evaluate(() => {
        const probe = document.createElement('i');
        probe.className = 'animate-spin';
        document.body.append(probe);
        const value = getComputedStyle(probe).animationDuration;
        probe.remove();
        return value;
      });
    expect(await duration()).not.toBe('0s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await duration()).toBe('0s');
  });

  await context.close();
});

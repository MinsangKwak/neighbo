import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { newAccount, newUser, sendMessage, signUp } from './helpers';

async function openRoom(seller: Page, buyer: Page, title: string) {
  const created = await seller.request.post('/api/products', {
    headers: { Origin: new URL(seller.url()).origin },
    data: { title, price: 1000, idempotencyKey: crypto.randomUUID() },
  });
  const productId = ((await created.json()) as { product: { id: string } }).product.id;
  await buyer.goto(`/products/${productId}`);
  await buyer.getByRole('button', { name: '채팅하기' }).click();
  await expect(buyer).toHaveURL(/\/chats\/c[a-z0-9]+$/);
  return new URL(buyer.url()).pathname;
}
const tall = (label: string) => `${label}\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄`;
const fromBottom = (page: Page) =>
  page.getByRole('main').evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));

test('[AC-CH-14] 아래를 보고 있으면 새 메시지를 따라 내려가고, 위를 보고 있으면 [새 메시지] 버튼으로 알린다', async ({ browser }) => {
  const s = await newUser(browser);
  const b = await newUser(browser);
  const seller = newAccount('seller');
  await signUp(s.page, seller);
  await signUp(b.page, newAccount('buyer'));
  const room = await openRoom(s.page, b.page, `스크롤 확인 ${seller.nickname}`);
  for (let index = 0; index < 8; index += 1) await sendMessage(b.page, tall(`긴 메시지 ${index}`));

  await s.page.goto(room);
  await expect(s.page.getByRole('log').getByText('긴 메시지 7')).toBeVisible();
  // 들어오면 맨 아래다
  expect(await fromBottom(s.page)).toBeLessThanOrEqual(2);

  await test.step('아래를 보고 있을 때: 따라 내려간다', async () => {
    await sendMessage(b.page, tall('아래에서 받은 메시지'));
    await expect(s.page.getByRole('log').getByText('아래에서 받은 메시지')).toBeInViewport();
    expect(await fromBottom(s.page)).toBeLessThanOrEqual(2);
    await expect(s.page.getByRole('button', { name: /새 메시지/ })).toHaveCount(0);
  });

  await test.step('위를 보고 있을 때: 자리를 지키고 버튼으로 알린다', async () => {
    await s.page.getByRole('main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(() => fromBottom(s.page)).toBeGreaterThan(100);
    await sendMessage(b.page, tall('위에서 받은 메시지'));
    const jump = s.page.getByRole('button', { name: /새 메시지/ });
    await expect(jump).toBeVisible();
    expect(await s.page.getByRole('main').evaluate((el) => el.scrollTop)).toBeLessThan(50);
    await expect(s.page.getByRole('log').getByText('위에서 받은 메시지')).not.toBeInViewport();

    await jump.click();
    await expect(s.page.getByRole('log').getByText('위에서 받은 메시지')).toBeInViewport();
    await expect(jump).toHaveCount(0);
  });

  await test.step('내가 보낸 것은 어디를 보고 있든 맨 아래로 간다', async () => {
    await s.page.getByRole('main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(() => fromBottom(s.page)).toBeGreaterThan(100);
    await sendMessage(s.page, '판매자가 보낸 답');
    await expect.poll(() => fromBottom(s.page)).toBeLessThanOrEqual(2);
  });

  await Promise.all([s.context.close(), b.context.close()]);
});

test('[AC-CH-38, AC-CH-39] 연결이 끊기면 5초 뒤 알리고, 그동안 쓴 메시지는 다시 붙었을 때 한 번만 간다', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = await newUser(browser);
  const b = await newUser(browser);
  const seller = newAccount('seller');

  // 구매자의 실시간 연결을 가로채 둔다 — 끊고 싶을 때 끊고, 끊긴 동안에는 새 연결도 막는다
  let down = false;
  const open: WebSocketRoute[] = [];
  await b.context.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (down) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    open.push(ws);
  });
  await b.context.route(/\/socket\.io\//, (route) => (down ? route.abort() : route.continue()));

  await signUp(s.page, seller);
  await signUp(b.page, newAccount('buyer'));
  const room = await openRoom(s.page, b.page, `끊김 확인 ${seller.nickname}`);
  await sendMessage(b.page, '끊기기 전 메시지');
  await s.page.goto(room);
  await expect(s.page.getByRole('log').getByText('끊기기 전 메시지')).toBeVisible();

  await test.step('끊는다: 5초 안에는 조용하고, 넘으면 알린다 [AC-CH-39]', async () => {
    down = true;
    await Promise.all(open.splice(0).map((ws) => ws.close()));
    const bar = b.page.getByText('실시간 연결이 끊겼어요. 다시 연결 중…');
    await b.page.waitForTimeout(3000);
    await expect(bar).toHaveCount(0);
    await expect(bar).toBeVisible({ timeout: 15_000 });
  });

  await test.step('끊긴 동안 보낸 메시지는 "연결 중…"으로 남고 상대에게 가지 않는다 [AC-CH-38]', async () => {
    await b.page.getByPlaceholder('메시지 보내기').fill('끊긴 동안 쓴 메시지');
    await b.page.getByRole('button', { name: '보내기' }).click();
    await expect(b.page.getByText('끊긴 동안 쓴 메시지')).toBeVisible();
    await expect(b.page.getByRole('log').getByText('연결 중…', { exact: true })).toBeVisible();
    await s.page.waitForTimeout(1500);
    await expect(s.page.getByText('끊긴 동안 쓴 메시지')).toHaveCount(0);
  });

  await test.step('다시 붙으면 안내가 사라지고 메시지가 한 번만 도착한다', async () => {
    down = false;
    await expect(s.page.getByRole('log').getByText('끊긴 동안 쓴 메시지')).toBeVisible({ timeout: 20_000 });
    await expect(b.page.getByText('실시간 연결이 끊겼어요. 다시 연결 중…')).toHaveCount(0);
    await expect(b.page.getByRole('log').getByText('연결 중…', { exact: true })).toHaveCount(0);
    await expect(s.page.getByRole('log').getByText('끊긴 동안 쓴 메시지')).toHaveCount(1);
    // 그 뒤의 대화도 이어진다
    await sendMessage(s.page, '다시 붙은 뒤의 답');
    await expect(b.page.getByRole('log').getByText('다시 붙은 뒤의 답')).toBeVisible();
  });

  await Promise.all([s.context.close(), b.context.close()]);
});

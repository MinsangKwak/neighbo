import { expect, test } from '@playwright/test';

test('공개 Node Swagger가 실제 계약을 표시하고 요청 실행을 제공하지 않는다', async ({ page }) => {
  const errors: string[] = [];
  const requests: { method: string; url: string }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));

  const response = await page.goto('/node-swagger');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('heading', { level: 1, name: 'neighbo · Node.js API' })).toBeVisible();
  await expect(page.locator('.opblock')).toHaveCount(31);
  await page.locator('.opblock-post').filter({ hasText: '회원가입' }).locator('.opblock-summary').click();
  await expect(page.getByRole('button', { name: 'Try it out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Execute', exact: true })).toHaveCount(0);

  const document = await page.request.get('/node-openapi.json');
  expect((await document.json()).servers).toEqual([{ url: '/api', description: '동일 오리진 API 프록시' }]);
  expect(errors).toEqual([]);
  const allowed = new Set(['/node-swagger', '/node-swagger/assets/swagger-ui.css', '/node-swagger/assets/swagger-ui-bundle.js', '/node-swagger/assets/init.js', '/node-openapi.json']);
  const origin = new URL(page.url()).origin;
  expect(requests.every(({ method, url }) => method === 'GET' && new URL(url).origin === origin && allowed.has(new URL(url).pathname))).toBe(true);
});

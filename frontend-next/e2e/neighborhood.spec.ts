import { expect, test } from '@playwright/test';
import { createProduct, fixture, newAccount, newUser, signUp } from './helpers';

test('동네를 고르면 홈에서 내 동네 물건만 볼 수 있다', async ({ browser }) => {
  const mapo = newAccount('mapo');
  const jongno = newAccount('jongno');
  const viewer = newAccount('viewer');
  const a = await newUser(browser);
  const b = await newUser(browser);
  const v = await newUser(browser);
  const guest = await newUser(browser);

  const setNeighborhood = async (page: typeof a.page, name: string) => {
    await page.goto('/me/edit');
    await page.getByLabel('내 동네').selectOption(name);
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page).toHaveURL('/me');
    await expect(page.getByLabel('내 정보').getByText(name)).toBeVisible();
  };

  const mapoTitle = `마포 물건 ${mapo.nickname}`;
  const jongnoTitle = `종로 물건 ${jongno.nickname}`;

  await test.step('판매자 둘: 동네를 정하고 물건을 올린다 [AC-NB-02, 03]', async () => {
    await signUp(a.page, mapo);
    await setNeighborhood(a.page, '마포구');
    await createProduct(a.page, { title: mapoTitle, price: '10000', description: '', photos: [fixture('photo-landscape.jpg')] });

    await signUp(b.page, jongno);
    await setNeighborhood(b.page, '종로구');
    await createProduct(b.page, { title: jongnoTitle, price: '20000', description: '', photos: [fixture('photo-landscape.jpg')] });
  });

  await test.step('동네가 없는 사람: 토글 대신 [내 동네 정하기]가 있다 [AC-NB-08]', async () => {
    await signUp(v.page, viewer);
    await v.page.goto('/');
    await expect(v.page.getByRole('checkbox', { name: /내 동네만/ })).toHaveCount(0);
    await v.page.getByRole('link', { name: '내 동네 정하기' }).click();
    await expect(v.page).toHaveURL('/me/edit');
  });

  await test.step('동네를 정하면: 카드에 동네가 보이고, 켜면 내 동네 물건만 남는다 [AC-NB-06, 07]', async () => {
    await setNeighborhood(v.page, '마포구');
    await v.page.goto('/');
    const mapoCard = v.page.getByRole('link', { name: new RegExp(mapoTitle) });
    const jongnoCard = v.page.getByRole('link', { name: new RegExp(jongnoTitle) });
    await expect(mapoCard).toContainText('마포구');
    await expect(jongnoCard).toContainText('종로구');

    await v.page.getByRole('checkbox', { name: '내 동네만 (마포구)' }).check();
    await expect(v.page).toHaveURL(/near=1/);
    await expect(jongnoCard).toHaveCount(0);
    await expect(mapoCard).toBeVisible();
  });

  await test.step('새로고침해도 켜진 채이고, 끄면 다시 모두 보인다 [AC-NB-07]', async () => {
    await v.page.reload();
    const toggle = v.page.getByRole('checkbox', { name: '내 동네만 (마포구)' });
    await expect(toggle).toBeChecked();
    await expect(v.page.getByRole('link', { name: new RegExp(jongnoTitle) })).toHaveCount(0);
    await toggle.uncheck();
    await expect(v.page).not.toHaveURL(/near=1/);
    await expect(v.page.getByRole('link', { name: new RegExp(jongnoTitle) })).toBeVisible();
  });

  await test.step('이사하면 판매 중인 물건이 따라간다 [AC-NB-04]', async () => {
    await setNeighborhood(b.page, '마포구');
    await v.page.goto('/?near=1');
    await expect(v.page.getByRole('link', { name: new RegExp(jongnoTitle) })).toContainText('마포구');
  });

  await test.step('손님: 토글도 링크도 없고, ?near=1은 전체 목록이다 [AC-NB-08]', async () => {
    await guest.page.goto('/?near=1');
    await expect(guest.page.getByRole('checkbox', { name: /내 동네만/ })).toHaveCount(0);
    await expect(guest.page.getByRole('link', { name: '내 동네 정하기' })).toHaveCount(0);
    await expect(guest.page.getByRole('link', { name: new RegExp(mapoTitle) })).toBeVisible();
  });

  await test.step('물건이 없는 동네: 빈 상태가 동네 이름을 말한다 [AC-NB-10]', async () => {
    // 테스트 DB를 여러 시나리오가 함께 쓰므로, 아무도 고르지 않는 동네로 옮겨 확인한다
    await setNeighborhood(v.page, '도봉구');
    await v.page.goto('/?near=1');
    await expect(v.page.getByText('도봉구에 올라온 물건이 없어요')).toBeVisible();
  });
});

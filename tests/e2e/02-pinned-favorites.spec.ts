import { test, expect, openApp, newTab, todayRows, pinnedRows, activeRowTitle, visibleFrame, savedState, MOD } from './fixtures';

test.describe('pinned tabs', () => {
  test('⌘D pins the active tab and again unpins it', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await expect(pinnedRows(page)).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(0);
    await expect(page.getByTestId('toast').first()).toContainText('Pinned');
    await page.keyboard.press(`${MOD}+d`);
    await expect(pinnedRows(page)).toHaveCount(0);
    await expect(todayRows(page)).toHaveCount(1);
  });

  test('pin from the right-click menu', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-pin').click();
    await expect(pinnedRows(page)).toHaveCount(1);
  });

  test('closing a pinned tab keeps it in the sidebar and unloads it', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await page.keyboard.press(`${MOD}+w`);
    await expect(pinnedRows(page)).toHaveCount(1);
    await expect(page.locator('.surface-slot')).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await pinnedRows(page).first().click();
    await expect(visibleFrame(page).locator('#title')).toHaveText('a.com');
  });

  test('a pinned tab that wandered off shows a way home', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#same').click();
    const row = pinnedRows(page).first();
    await expect(row).toHaveAttribute('data-title', 'a.com/page-2');
    const home = page.locator('[data-testid^="home-"]');
    await expect(home).toHaveCount(1);
    await home.click();
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
    await expect(home).toHaveCount(0);
  });

  test('“make this the pinned page” moves the home', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#same').click();
    await expect(page.getByTestId('url-pill')).toContainText('page-2');
    await pinnedRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-set-home').click();
    await expect(page.locator('[data-testid^="home-"]')).toHaveCount(0);
    const s = await savedState(page);
    const tab = Object.values(s.items)[0] as { homeUrl: string };
    expect(tab.homeUrl).toBe('https://a.com/page-2');
  });

  test('closing a pinned tab while away resets it to home', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#same').click();
    await expect(page.getByTestId('url-pill')).toContainText('page-2');
    await page.keyboard.press(`${MOD}+w`);
    await pinnedRows(page).first().click();
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
  });
});

test.describe('favorites', () => {
  test('add to Favorites shows an icon tile; clicking it opens the page', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await todayRows(page).nth(1).click({ button: 'right' });
    await page.getByTestId('menu-favorite').click();
    const fav = page.locator('[data-testid^="fav-"]');
    await expect(fav).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(1);
    await fav.click();
    await expect(fav).toHaveAttribute('data-active', 'true');
    await expect(visibleFrame(page).locator('#title')).toHaveText('a.com');
  });

  test('remove from Favorites returns it to Today', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-favorite').click();
    await page.locator('[data-testid^="fav-"]').click({ button: 'right' });
    await page.getByTestId('menu-unfavorite').click();
    await expect(page.locator('[data-testid^="fav-"]')).toHaveCount(0);
    await expect(todayRows(page)).toHaveCount(1);
  });

  test('favorite → pinned via menu', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-favorite').click();
    await page.locator('[data-testid^="fav-"]').click({ button: 'right' });
    await page.getByTestId('menu-fav-to-pinned').click();
    await expect(pinnedRows(page)).toHaveCount(1);
  });

  test('favorites and pins survive restart', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await page.keyboard.press(`${MOD}+d`);
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-favorite').click();
    await savedState(page);
    await page.reload();
    await expect(page.locator('[data-testid^="fav-"]')).toHaveCount(1);
    await expect(pinnedRows(page)).toHaveCount(1);
    expect(await activeRowTitle(page)).toBe('b.com');
  });
});

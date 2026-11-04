import { test, expect, openApp, newTab, todayRows, pinnedRows, visibleFrame, MOD } from './fixtures';

test.describe('peek', () => {
  test('a link to another site from a pinned tab opens in Peek; the tab stays put', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'mail.example.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#external').click();
    await expect(page.getByTestId('peek')).toBeVisible();
    await expect(page.getByTestId('peek-url')).toContainText('elsewhere.test/article');
    await expect(page.getByTestId('url-pill')).toHaveText('mail.example.com');
    await expect(pinnedRows(page)).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(0);
  });

  test('same-site links in a pinned tab do not Peek', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'mail.example.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#same').click();
    await expect(page.getByTestId('peek')).toHaveCount(0);
    await expect(page.getByTestId('url-pill')).toContainText('page-2');
  });

  test('normal (Today) tabs follow links normally; shift-click Peeks', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'news.example.com');
    await visibleFrame(page).locator('#external').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('peek')).toBeVisible();
    await page.getByTestId('peek-close').click();
    await expect(page.getByTestId('peek')).toHaveCount(0);
    await visibleFrame(page).locator('#external').click();
    await expect(page.getByTestId('peek')).toHaveCount(0);
    await expect(page.getByTestId('url-pill')).toContainText('elsewhere.test');
  });

  test('Esc closes Peek (from the app or from inside the page); Reopen brings it back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await visibleFrame(page).locator('#external').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('peek')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('peek')).toHaveCount(0);
    await page.getByTestId('toast').getByText('Reopen').click();
    await expect(page.getByTestId('peek')).toBeVisible();
    await page.frameLocator('.peek iframe').locator('#lede').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('peek')).toHaveCount(0);
  });

  test('clicking the dimmed background closes Peek', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await visibleFrame(page).locator('#external').click({ modifiers: ['Shift'] });
    await page.getByTestId('peek').click({ position: { x: 6, y: 300 } });
    await expect(page.getByTestId('peek')).toHaveCount(0);
  });

  test('Open turns the Peek into a tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#external').click();
    await page.getByTestId('peek-expand').click();
    await expect(page.getByTestId('peek')).toHaveCount(0);
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toContainText('elsewhere.test/article');
  });

  test('Split puts the Peek next to the page', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#external').click();
    await page.getByTestId('peek-split').click();
    await expect(page.locator('.pane-frame')).toHaveCount(2);
  });

  test('browsing inside Peek updates its address', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await visibleFrame(page).locator('#external').click({ modifiers: ['Shift'] });
    await page.frameLocator('.peek iframe').locator('#same').click();
    await expect(page.getByTestId('peek-url')).toContainText('elsewhere.test/page-2');
  });

  test('Peek can be turned off for pinned tabs in settings', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'warmup.com'); // makes sure there is saved state to edit
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('kite-state')!);
      raw.settings.peekOnExternalLinksFromPinned = false;
      localStorage.setItem('kite-state', JSON.stringify(raw));
    });
    await page.reload();
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await visibleFrame(page).locator('#external').click();
    await expect(page.getByTestId('peek')).toHaveCount(0);
  });
});

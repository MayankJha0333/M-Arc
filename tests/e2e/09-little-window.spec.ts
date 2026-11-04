import { test, expect, openApp, newTab, todayRows, MOD } from './fixtures';

test.describe('little window', () => {
  test('⌘⌥N and ⌥⌘-click ask for a little window', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+Alt+n`);
    await page.frameLocator('.surface-slot[data-visible] iframe').locator('#external').click({ modifiers: ['Alt', 'Meta'] });
    const opened = await page.evaluate(() => window.__kiteTest!.littleOpened);
    expect(opened).toEqual(['kite://new', 'https://elsewhere.test/article']);
    await expect(todayRows(page)).toHaveCount(1); // the page itself didn't navigate
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
  });

  test('a blank little window starts with a search box', async ({ page }) => {
    await page.goto('/?platform=darwin&mode=little');
    await expect(page.getByTestId('little-input')).toBeFocused();
    await page.getByTestId('little-input').fill('quick.example');
    await page.getByTestId('little-input').press('Enter');
    await expect(page.getByTestId('little-url')).toContainText('quick.example');
    await expect(page.frameLocator('iframe').locator('#title')).toHaveText('quick.example');
  });

  test('shows the page and moves it to the main window (any Space)', async ({ page }) => {
    await page.goto('/?platform=darwin&mode=little&url=' + encodeURIComponent('https://read.example/story'));
    await expect(page.getByTestId('little-url')).toContainText('read.example/story');
    await page.getByTestId('little-open-main').click();
    let moved = await page.evaluate(() => window.__kiteTest!.littleMoved);
    expect(moved).toEqual([{ url: 'https://read.example/story', spaceId: null }]);
    await page.getByTestId('little-open-menu').click();
    await page.locator('[data-testid^="little-space-"]').first().click();
    moved = await page.evaluate(() => window.__kiteTest!.littleMoved);
    expect(moved[1].spaceId).not.toBeNull();
  });

  test('links inside the little window navigate it; click the address to edit', async ({ page }) => {
    await page.goto('/?platform=darwin&mode=little&url=' + encodeURIComponent('https://read.example/'));
    await page.frameLocator('iframe').locator('#same').click();
    await expect(page.getByTestId('little-url')).toContainText('read.example/page-2');
    await page.getByTestId('little-url').click();
    await page.getByTestId('little-input').fill('other.example');
    await page.getByTestId('little-input').press('Enter');
    await expect(page.getByTestId('little-url')).toContainText('other.example');
  });

  test('the main window opens a page handed over from a little window', async ({ page }) => {
    await openApp(page);
    // Simulate the hand-over event the main process delivers after "Open in Kite".
    await page.evaluate(() => window.__kiteTest!.handOver('https://handed.example/', null));
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toHaveText('handed.example');
  });

  test('a little window that archived itself shows up in the Archive', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__kiteTest!.littleArchived('https://brief.example/', 'Brief look'));
    await page.keyboard.press(`${MOD}+y`);
    await expect(page.getByTestId('archive-row')).toHaveAttribute('data-title', 'Brief look');
  });
});

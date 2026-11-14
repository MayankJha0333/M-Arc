import { test, expect, openApp, newTab, todayRows, savedState } from './fixtures';

test.describe('New Tab opens a new-tab page', () => {
  test('clicking New Tab adds a tab showing the start page, ready to type', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.getByTestId('btn-new-tab').click();
    await expect(page.getByTestId('start-page')).toBeVisible();
    await expect(page.getByTestId('command-bar')).toHaveCount(0);
    await expect(page.getByTestId('start-input')).toBeFocused();
    await expect(todayRows(page)).toHaveCount(2);
    await expect(todayRows(page).first()).toContainText('New Tab');
    // The address bar reads as empty, and clicking it goes to the big box.
    await expect(page.getByTestId('url-pill')).toHaveText('Search or enter address');
    await page.getByTestId('start-input').blur();
    await page.getByTestId('url-pill').click();
    await expect(page.getByTestId('start-input')).toBeFocused();
    // Clicking New Tab again on an empty new tab doesn't make another.
    await page.getByTestId('btn-new-tab').click();
    await expect(todayRows(page)).toHaveCount(2);
  });

  test('what you type opens in that same tab; nothing about the new tab goes in history', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('btn-new-tab').click();
    await page.getByTestId('start-input').fill('b.com');
    await page.getByTestId('start-input').press('Enter');
    await expect(page.getByTestId('start-page')).toHaveCount(0);
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toHaveText('b.com');
    const s = await savedState(page);
    expect(s.history.some((h: { url: string }) => h.url.startsWith('kite:'))).toBe(false);
  });

  test('suggestions from history and most-visited tiles', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'https://github.com');
    await newTab(page, 'https://example.com');
    await page.getByTestId('btn-new-tab').click();
    await expect(page.getByTestId('start-site')).toHaveCount(2);
    await page.getByTestId('start-input').fill('git');
    await expect(page.getByTestId('start-suggest').getByRole('option')).toHaveCount(1);
    await page.getByTestId('start-input').press('ArrowDown');
    await page.getByTestId('start-input').press('Enter');
    await expect(page.getByTestId('url-pill')).toHaveText('github.com');
    // A tile opens its site too.
    await page.getByTestId('btn-new-tab').click();
    // Tiles show a friendly name, not the bare address.
    await expect(page.getByTestId('start-site').filter({ hasText: 'GitHub' })).toBeVisible();
    await page.getByTestId('start-site').filter({ hasText: 'Example' }).click();
    await expect(page.getByTestId('url-pill')).toHaveText('example.com');
  });

  test('favorites get their own row and are not repeated below', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'https://github.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-favorite').click();
    await newTab(page, 'https://example.com');
    await page.getByTestId('btn-new-tab').click();
    await expect(page.getByTestId('start-favorite')).toHaveCount(1);
    await expect(page.getByTestId('start-favorite')).toContainText('GitHub');
    await expect(page.getByTestId('start-site').filter({ hasText: 'GitHub' })).toHaveCount(0);
    await page.getByTestId('start-favorite').click();
    await expect(page.getByTestId('url-pill')).toHaveText('github.com');
  });

  test('with nothing open, the start page box opens a new tab', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByTestId('start-input').fill('c.com');
    await page.getByTestId('start-input').press('Enter');
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toHaveText('c.com');
  });

  test('the keyboard shortcut still opens the command bar', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Meta+t');
    await expect(page.getByTestId('cb-input')).toBeVisible();
  });
});

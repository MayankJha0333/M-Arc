import { test, expect, openApp, newTab, todayRows, activeRowTitle, MOD } from './fixtures';

test.describe('command bar', () => {
  test('empty: shows recent tabs; Esc and clicking outside close it', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await page.keyboard.press(`${MOD}+t`);
    const rows = page.locator('.cb-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('b.com');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-bar')).toHaveCount(0);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('command-bar').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('command-bar')).toHaveCount(0);
  });

  test('typing a site name finds the open tab and switches to it instead of opening a duplicate', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'github.com');
    await newTab(page, 'b.com');
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('git');
    const first = page.locator('.cb-row').first();
    await expect(first).toHaveAttribute('data-kind', 'tab');
    await expect(first).toContainText('Switch to Tab');
    await expect(first.locator('mark').first()).toHaveText('git');
    await page.keyboard.press('Enter');
    await expect(todayRows(page)).toHaveCount(2);
    expect(await activeRowTitle(page)).toBe('github.com');
  });

  test('arrow keys pick a result; the search result searches', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'github.com');
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('git');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cb-row[data-on]')).toHaveAttribute('data-kind', 'search');
    await page.keyboard.press('Enter');
    await expect(todayRows(page)).toHaveCount(2);
    await expect(page.getByTestId('url-pill')).toContainText('duckduckgo.com');
  });

  test('a URL offers Open first', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('kite.dev/docs');
    await expect(page.locator('.cb-row').first()).toHaveAttribute('data-kind', 'open');
    await expect(page.locator('.cb-row').first()).toContainText('Open kite.dev/docs');
  });

  test('runs actions by name (New Space)', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('new space');
    await expect(page.locator('.cb-row[data-kind="action"]').first()).toContainText('New Space');
    await page.locator('.cb-row[data-kind="action"]').first().click();
    await expect(page.getByTestId('space-editor')).toBeVisible();
  });

  test('switches Spaces by name', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('btn-new-space').click();
    await page.getByTestId('space-name-input').fill('Research');
    await page.getByTestId('space-done').click();
    await page.keyboard.press('Control+1');
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('resea');
    await page.locator('.cb-row[data-kind="space"]').click();
    await expect(page.getByTestId('space-name')).toHaveText('Research');
  });

  test('finds pages from history', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'docs.example.com');
    await page.keyboard.press(`${MOD}+w`);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('docs.exa');
    await expect(page.locator('.cb-row[data-kind="history"]')).toHaveCount(1);
  });

  test('⌘L shows the URL without suggestions until you type; ⌘Enter opens a new tab instead', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+l`);
    await expect(page.locator('.cb-row')).toHaveCount(0);
    await page.getByTestId('cb-input').fill('b.com');
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(todayRows(page)).toHaveCount(2);
  });

  test('toggle light/dark from the command bar', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('toggle light');
    await page.keyboard.press('Enter');
    const first = await page.getByTestId('app').getAttribute('data-theme');
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('toggle light');
    await page.keyboard.press('Enter');
    expect(await page.getByTestId('app').getAttribute('data-theme')).not.toBe(first);
  });
});

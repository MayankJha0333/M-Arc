import type { Page } from '@playwright/test';
import { test, expect, openApp, todayRows } from './fixtures';

async function openRouting(page: Page) {
  await page.keyboard.press('Meta+t');
  await page.getByTestId('cb-input').fill('link routing');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('routing-panel')).toBeVisible();
}

async function addSpace(page: Page, name: string) {
  await page.getByTestId('btn-new-space').click();
  await page.getByTestId('space-name-input').fill(name);
  await page.getByTestId('space-done').click();
}

test.describe('link routing', () => {
  test('links from other apps open in a little window by default', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__kiteTest!.externalUrl('https://mail.example/msg'));
    const opened = await page.evaluate(() => window.__kiteTest!.littleOpened);
    expect(opened).toEqual(['https://mail.example/msg']);
    await expect(todayRows(page)).toHaveCount(0);
  });

  test('or in the current Space, if you prefer', async ({ page }) => {
    await openApp(page);
    await openRouting(page);
    await page.getByTestId('route-fallback-active').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__kiteTest!.externalUrl('https://mail.example/msg'));
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toHaveText('mail.example/msg');
  });

  test('a rule sends a site to a chosen Space (and switches there)', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Music');
    await page.keyboard.press('Control+1');
    await openRouting(page);
    await page.getByTestId('route-add').click();
    await page.getByTestId('route-value').fill('spotify.com');
    await page.getByTestId('route-target').selectOption({ label: '✦ Music' });
    await page.getByTestId('route-test').fill('open.spotify.com/track/9');
    await expect(page.getByTestId('route-result')).toContainText('Music');
    await page.getByTestId('route-test').fill('other.com');
    await expect(page.getByTestId('route-result')).toContainText('no rule matched');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__kiteTest!.externalUrl('https://open.spotify.com/track/9'));
    await expect(page.getByTestId('space-name')).toHaveText('Music');
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('toast').filter({ hasText: 'Opened in' })).toHaveCount(1);
  });

  test('“link contains” rules, rule order, and switching a rule off', async ({ page }) => {
    await openApp(page);
    await openRouting(page);
    await page.getByTestId('route-add').click();
    await page.getByTestId('route-match').selectOption('contains');
    await page.getByTestId('route-value').fill('meet');
    await page.getByTestId('route-target').selectOption({ label: 'Current Space' });
    await page.getByTestId('route-test').fill('https://meet.google.com/abc');
    await expect(page.getByTestId('route-result')).toContainText('current Space');
    await page.getByTestId('route-enabled').click();
    await expect(page.getByTestId('route-result')).toContainText('little window');
    await page.getByTestId('route-delete').click();
    await expect(page.getByTestId('route-row')).toHaveCount(0);
  });

  test('default browser button', async ({ page }) => {
    await openApp(page);
    await openRouting(page);
    await page.getByTestId('make-default').click();
    await expect(page.getByText('Kite is your default browser')).toBeVisible();
  });
});

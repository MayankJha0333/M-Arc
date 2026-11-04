import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, pinnedRows, savedState, MOD } from './fixtures';

const HOUR = 3600_000;

/** Move Kite's clock forward and run the auto-archive check. */
async function timeTravel(page: Page, ms: number) {
  await page.evaluate((ms) => {
    const t = window.__kiteTest!;
    t.now = (t.now ?? Date.now()) + ms;
    t.shortcut('runAutoArchive');
  }, ms);
}

test.describe('auto-archive', () => {
  test('unused Today tabs are archived after 12 hours; the open tab and pinned tabs stay', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'old.com');
    await page.keyboard.press(`${MOD}+d`); // pin it
    await newTab(page, 'stale.com');
    await newTab(page, 'current.com');
    await timeTravel(page, 11 * HOUR);
    await expect(todayRows(page)).toHaveCount(2);
    await timeTravel(page, 1 * HOUR);
    await expect(todayRows(page)).toHaveCount(1);
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'current.com');
    await expect(pinnedRows(page)).toHaveCount(1);
    await expect(page.getByTestId('toast').filter({ hasText: 'Auto-archived 1 tab' })).toHaveCount(1);
  });

  test('the toast opens the Archive and restoring brings the tab back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'stale.com');
    await newTab(page, 'current.com');
    await timeTravel(page, 13 * HOUR);
    await page.getByTestId('toast').getByText('View').click();
    await expect(page.getByTestId('archive-page')).toBeVisible();
    const row = page.getByTestId('archive-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('auto-archived');
    await row.getByTestId('archive-restore').click();
    await expect(page.getByTestId('archive-page')).toHaveCount(0);
    await expect(todayRows(page)).toHaveCount(2);
    await expect(page.locator('.row[data-active]')).toHaveAttribute('data-title', 'stale.com');
  });

  test('a Space set to "Never" keeps everything', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-edit-space').click();
    await page.getByTestId('space-archive').selectOption({ label: 'Never' });
    await page.getByTestId('space-done').click();
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await timeTravel(page, 400 * 24 * HOUR);
    await expect(todayRows(page)).toHaveCount(2);
  });

  test('a Space set to 1 hour archives sooner', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-edit-space').click();
    await page.getByTestId('space-archive').selectOption({ label: '1 hour' });
    await page.getByTestId('space-done').click();
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await timeTravel(page, HOUR + 1000);
    await expect(todayRows(page)).toHaveCount(1);
  });
});

test.describe('archive page', () => {
  test('Clear archives all Today tabs, with Undo', async ({ page }) => {
    await openApp(page);
    for (const u of ['a.com', 'b.com', 'c.com']) await newTab(page, u);
    await page.getByTestId('btn-clear-today').click();
    await expect(todayRows(page)).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('toast').filter({ hasText: 'Archived 3 tabs' })).toHaveCount(1);
    await page.getByTestId('toast').getByText('Undo').click();
    await expect(todayRows(page)).toHaveCount(3);
  });

  test('search, delete one, clear all (with confirm)', async ({ page }) => {
    await openApp(page);
    for (const u of ['alpha.com', 'beta.com', 'gamma.com']) await newTab(page, u);
    await page.getByTestId('btn-clear-today').click();
    await page.keyboard.press(`${MOD}+y`);
    await expect(page.getByTestId('archive-row')).toHaveCount(3);
    await expect(page.locator('.arch-day').first()).toHaveText('Today');
    await page.getByTestId('archive-search').fill('bet');
    await expect(page.getByTestId('archive-row')).toHaveCount(1);
    await page.getByTestId('archive-search').fill('');
    await page.getByTestId('archive-row').first().hover();
    await page.getByTestId('archive-row').first().getByTestId('archive-delete').click();
    await expect(page.getByTestId('archive-row')).toHaveCount(2);
    await page.getByTestId('archive-clear').click();
    await page.getByTestId('archive-clear-confirm').click();
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    const s = await savedState(page);
    expect(s.archive).toEqual([]);
  });

  test('Esc closes the Archive; the footer button opens it', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('btn-archive').click();
    await expect(page.getByTestId('archive-page')).toBeVisible();
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('archive-page')).toHaveCount(0);
  });
});

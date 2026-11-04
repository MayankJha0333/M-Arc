import { test as base, expect, type Page } from '@playwright/test';

export const MOD = 'Meta'; // tests run the UI as if on macOS (?platform=darwin)

export async function openApp(page: Page, opts: { state?: unknown } = {}) {
  if (opts.state) {
    await page.addInitScript((s) => localStorage.setItem('kite-state', JSON.stringify(s)), opts.state);
  }
  await page.goto('/?platform=darwin');
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

/** Open a new tab through the command bar and wait for it to appear. */
export async function newTab(page: Page, input: string) {
  await page.keyboard.press(`${MOD}+t`);
  await page.getByTestId('cb-input').fill(input);
  await page.getByTestId('cb-input').press('Enter');
  await expect(page.getByTestId('command-bar')).toHaveCount(0);
}

export function todayRows(page: Page) {
  return page.getByTestId('today-list').locator('[data-testid^="row-"]');
}

export function pinnedRows(page: Page) {
  return page.getByTestId('pinned-list').locator(':scope > [data-testid^="row-"], :scope > .folder > [data-testid^="row-"]');
}

export async function activeRowTitle(page: Page) {
  return page.locator('.row[data-active]').getAttribute('data-title');
}

/** Saved state as the app wrote it. */
export async function savedState(page: Page) {
  await page.waitForTimeout(450); // autosave debounce
  return page.evaluate(() => JSON.parse(localStorage.getItem('kite-state') || 'null'));
}

/** The simulated page frame for the visible tab. */
export function visibleFrame(page: Page) {
  return page.frameLocator('.surface-slot[data-visible] iframe').first();
}

export const test = base;
export { expect };

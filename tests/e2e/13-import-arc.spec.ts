import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openApp, pinnedRows, todayRows, savedState, MOD } from './fixtures';

const ARC = readFileSync(join(process.cwd(), 'tests/fixtures/arc-sidebar.json'), 'utf8');

async function openImport(page: import('@playwright/test').Page) {
  await page.keyboard.press(`${MOD}+t`);
  await page.getByTestId('cb-input').fill('import from arc');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('import-arc')).toBeVisible();
}

test.describe('import from Arc', () => {
  test('finds Arc’s file automatically, previews, and imports everything', async ({ page }) => {
    await openApp(page);
    await page.evaluate((t) => (window.__kiteTest!.arcFileText = t), ARC);
    await openImport(page);
    await page.getByTestId('import-auto').click();
    await expect(page.getByTestId('import-space')).toHaveCount(2);
    await expect(page.getByTestId('import-space').first()).toContainText('Work');
    await expect(page.getByTestId('import-space').first()).toContainText('5 pinned tabs · 2 folders · 1 note · 2 open tabs');
    await expect(page.getByTestId('import-skipped')).toContainText('2 items will be skipped');
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Imported 2 Spaces' })).toHaveCount(1);
    await expect(page.getByTestId('space-name')).toHaveText('Work');
    await expect(pinnedRows(page)).toHaveCount(4); // tab, folder, split, note
    await expect(page.locator('.folder-row[data-title="Design"]')).toHaveCount(1);
    await expect(page.locator('[data-kind="split"]')).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(2);
    await expect(page.locator('[data-testid^="fav-"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="space-bar"] [role="tab"]')).toHaveCount(3);
    const s = await savedState(page);
    expect(s.spaces.map((x: any) => x.name)).toEqual(['Home', 'Work', 'Arc Space 2']);
  });

  test('choose a file, pick only some Spaces, skip Favorites', async ({ page }) => {
    await openApp(page);
    await openImport(page);
    await page.getByTestId('import-file').setInputFiles({ name: 'StorableSidebar.json', mimeType: 'application/json', buffer: Buffer.from(ARC) });
    await page.getByTestId('import-space').first().locator('input').uncheck();
    await page.getByTestId('import-favs').click();
    await page.getByTestId('import-run').click();
    const s = await savedState(page);
    expect(s.spaces.map((x: any) => x.name)).toEqual(['Home', 'Arc Space 2']);
    expect(s.favorites).toEqual([]);
  });

  test('a wrong file shows a clear message', async ({ page }) => {
    await openApp(page);
    await openImport(page);
    await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByTestId('import-error')).toContainText('No Spaces or tabs found');
    await expect(page.getByTestId('import-run')).toBeDisabled();
  });

  test('no Arc on this computer: says so', async ({ page }) => {
    await openApp(page);
    await openImport(page);
    await page.getByTestId('import-auto').click();
    await expect(page.getByTestId('import-error')).toContainText('Couldn’t find Arc’s data');
  });

  test('imported pages load and imported Space colors apply', async ({ page }) => {
    await openApp(page);
    await page.evaluate((t) => (window.__kiteTest!.arcFileText = t), ARC);
    await openImport(page);
    await page.getByTestId('import-auto').click();
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('app')).toHaveCSS('--tint-1', '#3366cc');
    await pinnedRows(page).first().click();
    await expect(page.frameLocator('.surface-slot[data-visible] iframe').locator('#title')).toHaveText('github.com/my-org');
  });
});

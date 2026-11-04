import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, savedState, MOD } from './fixtures';

async function openSettings(page: Page, section?: string) {
  await page.keyboard.press(`${MOD}+Comma`);
  await expect(page.getByTestId('settings')).toBeVisible();
  if (section) await page.getByTestId(`settings-${section}`).click();
}

const cssVar = (page: Page, name: string) => page.getByTestId('app').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test.describe('settings: appearance', () => {
  test('sidebar can move to the right', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await page.getByTestId('set-side-right').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-side', 'right');
    const sb = (await page.getByTestId('sidebar').boundingBox())!;
    expect(sb.x).toBeGreaterThan(800);
  });

  test('spacing, font, text size, corners, page margin and sidebar width all apply', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await openSettings(page);
    await page.getByTestId('set-density-compact').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-density', 'compact');
    expect(await cssVar(page, '--row-h')).toBe('30px');
    await page.getByTestId('set-font-mono').click();
    expect(await cssVar(page, '--font')).toContain('monospace');
    await page.getByTestId('set-scale').fill('1.15');
    expect(await cssVar(page, '--scale')).toBe('1.15');
    await page.getByTestId('set-radius').fill('20');
    await expect(page.getByTestId('page-card')).toHaveCSS('border-radius', '20px');
    await page.getByTestId('set-gap').fill('0');
    expect(await cssVar(page, '--gap')).toBe('0px');
    await page.getByTestId('set-width').fill('360');
    await expect.poll(() => page.getByTestId('sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(360);
    const s = await savedState(page);
    expect(s.settings).toMatchObject({ density: 'compact', font: 'mono', fontScale: 1.15, radius: 20, gap: 0, sidebarWidth: 360 });
  });

  test('hide the address bar; reduce motion; favorites per row', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await page.getByTestId('set-urlbar').click();
    await expect(page.getByTestId('url-pill')).toHaveCount(0);
    await page.getByTestId('set-motion').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-motion', 'reduced');
    await page.getByTestId('set-favcols').fill('6');
    expect((await savedState(page)).settings.favoritesColumns).toBe(6);
  });

  test('custom CSS restyles Kite itself; reset appearance undoes everything', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await page.getByTestId('set-chrome-css').fill('.space-name { color: rgb(200, 0, 0) !important; }');
    await expect(page.getByTestId('space-name')).toHaveCSS('color', 'rgb(200, 0, 0)');
    await page.getByTestId('set-side-right').click();
    await page.getByTestId('set-reset-appearance').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-side', 'left');
    await expect(page.getByTestId('space-name')).not.toHaveCSS('color', 'rgb(200, 0, 0)');
  });

  test('the Space colors card opens the Space editor', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await page.getByTestId('settings-space-theme').click();
    await expect(page.getByTestId('space-editor')).toBeVisible();
  });
});

test.describe('settings: tabs, search, keyboard, data', () => {
  test('search engine: pick one or use your own', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'tabs');
    await page.getByTestId('set-engine').selectOption({ label: 'Kagi' });
    await page.keyboard.press('Escape');
    await newTab(page, 'paper planes');
    await expect(page.getByTestId('url-pill')).toContainText('kagi.com');
    await openSettings(page, 'tabs');
    await page.getByTestId('set-engine-custom').fill('https://search.example/find?words=%s');
    await page.getByTestId('set-engine-custom').press('Enter');
    await page.keyboard.press('Escape');
    await newTab(page, 'kites');
    await expect(page.getByTestId('url-pill')).toContainText('search.example/find?words=kites');
  });

  test('global auto-archive time; the Archive page link opens this section', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+y`);
    await page.getByTestId('archive-settings').click();
    await expect(page.getByTestId('set-archive')).toBeVisible();
    await page.getByTestId('set-archive').selectOption({ label: 'Never' });
    expect((await savedState(page)).settings.archiveAfterMs).toBeNull();
  });

  test('record a new shortcut and use it; conflicts are explained', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'keys');
    await page.getByTestId('key-btn-newNote').click();
    await expect(page.getByTestId('key-btn-newNote')).toHaveText('Press keys…');
    await page.keyboard.press(`${MOD}+Shift+k`);
    await expect(page.getByTestId('key-btn-newNote')).toHaveText('⇧⌘K');
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${MOD}+Shift+k`);
    await expect(todayRows(page).first()).toHaveAttribute('data-kind', 'note');
    // taking another action's keys
    await openSettings(page, 'keys');
    await page.getByTestId('key-btn-newFolder').click();
    await page.keyboard.press(`${MOD}+Shift+k`);
    await expect(page.getByTestId('key-warn')).toContainText('New note');
    await expect(page.getByTestId('key-btn-newNote')).toContainText('None');
    await page.getByTestId('keys-reset-all').click();
    await expect(page.getByTestId('key-btn-newNote')).toHaveText('⇧⌘O');
  });

  test('Esc while recording cancels without closing Settings; ⌫ removes a shortcut', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'keys');
    await page.getByTestId('key-btn-reload').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('key-btn-reload')).toHaveText('⌘R');
    await page.getByTestId('key-btn-reload').click();
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('key-btn-reload')).toContainText('None');
    await page.getByTestId('key-reset-reload').click();
    await expect(page.getByTestId('key-btn-reload')).toHaveText('⌘R');
  });

  test('back up and restore', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'keep.com');
    await openSettings(page, 'data');
    await page.getByTestId('backup-export').click();
    const backup = await page.evaluate(() => window.__kiteTest!.exported[0]);
    expect(backup.name).toMatch(/^kite-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await page.getByTestId('reset-all').click();
    await page.getByTestId('reset-all-confirm').click();
    await expect(todayRows(page)).toHaveCount(0);
    await openSettings(page, 'data');
    await page.getByTestId('backup-import').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup.text) });
    await page.keyboard.press('Escape');
    await expect(todayRows(page)).toHaveCount(1);
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'keep.com');
  });

  test('a wrong backup file is refused with a message', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'data');
    await page.getByTestId('backup-import').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
    await expect(page.getByTestId('backup-error')).toContainText('isn’t a Kite backup');
  });

  test('clear history', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await openSettings(page, 'tabs');
    await page.getByTestId('set-clear-history').click();
    expect((await savedState(page)).history).toEqual([]);
  });

  test('links section opens Routing and Boosts', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'links');
    await page.getByTestId('settings-open-routing').click();
    await expect(page.getByTestId('routing-panel')).toBeVisible();
    await openSettings(page, 'links');
    await page.getByTestId('settings-open-boosts').click();
    await expect(page.getByTestId('boosts-list')).toBeVisible();
  });
});

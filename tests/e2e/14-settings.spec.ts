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
    await openSettings(page, 'layout');
    await page.getByTestId('set-side-right').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-side', 'right');
    const sb = (await page.getByTestId('sidebar').boundingBox())!;
    expect(sb.x).toBeGreaterThan(800);
  });

  test('spacing, font, text size, corners, page margin and sidebar width all apply', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await openSettings(page, 'layout');
    await page.getByTestId('set-density-compact').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-density', 'compact');
    expect(await cssVar(page, '--row-h')).toBe('30px');
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('set-font-mono').click();
    expect(await cssVar(page, '--font')).toContain('monospace');
    await page.getByTestId('set-scale').fill('1.15');
    expect(await cssVar(page, '--scale')).toBe('1.15');
    await page.getByTestId('settings-layout').click();
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
    await openSettings(page, 'layout');
    await page.getByTestId('set-urlbar').click();
    await expect(page.getByTestId('url-pill')).toHaveCount(0);
    await page.getByTestId('set-favcols').fill('6');
    await page.getByTestId('settings-motion').click();
    await page.getByTestId('set-motion').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-motion', 'reduced');
    expect((await savedState(page)).settings.favoritesColumns).toBe(6);
  });

  test('custom CSS restyles Kite itself; reset appearance undoes everything', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await page.getByTestId('set-chrome-css').fill('.space-name { color: rgb(200, 0, 0) !important; }');
    await expect(page.getByTestId('space-name')).toHaveCSS('color', 'rgb(200, 0, 0)');
    await page.getByTestId('settings-layout').click();
    await page.getByTestId('set-side-right').click();
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('set-reset-appearance').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-side', 'left');
    await expect(page.getByTestId('space-name')).not.toHaveCSS('color', 'rgb(200, 0, 0)');
  });

  test('Appearance points to this Space\'s background, which lives on the Spaces page', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await expect(page.getByTestId('settings-scope')).toHaveText('All Spaces');
    await page.getByTestId('settings-open-background').click();
    await expect(page.getByTestId('settings-spaces')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('settings-scope')).toHaveText('This Space');
    await expect(page.getByTestId('bg-kind')).toBeVisible();
  });
});

test.describe('settings: tabs, search, keyboard, data', () => {
  test('search engine: pick one or use your own', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'links');
    await page.getByTestId('set-engine').selectOption({ label: 'Kagi' });
    await page.keyboard.press('Escape');
    await newTab(page, 'paper planes');
    await expect(page.getByTestId('url-pill')).toContainText('kagi.com');
    await openSettings(page, 'links');
    // The box for your own engine appears only after picking "Custom…".
    await expect(page.getByTestId('set-engine-custom')).toHaveCount(0);
    await page.getByTestId('set-engine').selectOption({ label: 'Custom…' });
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
    await expect(page.getByTestId('backup-confirm')).toContainText('1 Space, 1 tab, 0 notes and 0 Boosts');
    await page.getByTestId('backup-restore-confirm').click();
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
    await openSettings(page, 'privacy');
    await page.getByTestId('set-clear-history').click();
    expect((await savedState(page)).history).toEqual([]);
  });

  test('Search & Links opens Routing; Extensions & Boosts opens Boosts', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'links');
    await page.getByTestId('settings-open-routing').click();
    await expect(page.getByTestId('routing-panel')).toBeVisible();
    await openSettings(page, 'extensions');
    await page.getByTestId('settings-open-boosts').click();
    await expect(page.getByTestId('boosts-list')).toBeVisible();
  });
});

test.describe('settings layout and search', () => {
  test('search narrows the sections, jumps to the match, and Esc clears it before closing', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    const tabs = page.locator('.settings-tab');
    await expect(tabs).toHaveCount(11);
    await page.getByTestId('settings-search').fill('cookie');
    await expect(tabs).toHaveCount(1);
    await expect(page.getByTestId('settings-privacy')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.settings-head-title')).toHaveText('Privacy & Security');
    await expect(page.locator('[data-hit]')).toContainText('Cookie banners');
    await page.getByTestId('settings-search').fill('nothing like this');
    await expect(page.getByTestId('settings-nomatch')).toBeVisible();
    await page.getByTestId('settings-search').press('Escape');
    await expect(page.getByTestId('settings-search')).toHaveValue('');
    await expect(tabs).toHaveCount(11);
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings')).toHaveCount(0);
  });

  test('a section keeps one size: switching sections does not resize the window', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    const a = (await page.getByTestId('settings').boundingBox())!;
    await page.getByTestId('settings-about').click();
    const b = (await page.getByTestId('settings').boundingBox())!;
    expect([b.width, b.height]).toEqual([a.width, a.height]);
  });
});

test.describe('sidebar: no empty placeholders', () => {
  test('with no Favorites or pinned tabs, nothing empty sits between the address bar and the tabs', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    const pill = (await page.getByTestId('url-pill').boundingBox())!;
    const header = (await page.getByTestId('space-header').boundingBox())!;
    expect(header.y - (pill.y + pill.height)).toBeLessThanOrEqual(16);
    await expect(page.getByText('Drop here to add to Favorites')).toBeHidden();
    await expect(page.getByText('Drop here to pin')).toBeHidden();
  });
});

test.describe('settings is a page, not a dialog', () => {
  test('it fills the page area, the sidebar stays usable, and picking a tab goes back to it', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await page.keyboard.press(`${MOD}+Comma`);
    const card = (await page.getByTestId('page-card').boundingBox())!;
    const settings = (await page.getByTestId('settings').boundingBox())!;
    expect([settings.x, settings.y, settings.width, settings.height]).toEqual([card.x, card.y, card.width, card.height]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The tab you were on: clicking it leaves Settings.
    await todayRows(page).first().click();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    // Another tab works too, and so does a new one.
    await page.keyboard.press(`${MOD}+Comma`);
    await todayRows(page).nth(1).click();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await page.keyboard.press(`${MOD}+Comma`);
    await newTab(page, 'c.com');
    await expect(page.getByTestId('settings')).toHaveCount(0);
  });
});

test.describe('design review fixes', () => {
  test('an empty window has one place to search; the sidebar address bar comes back with a tab', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('start-input')).toHaveAttribute('placeholder', 'Search or enter address');
    await expect(page.getByTestId('url-pill')).toHaveCount(0);
    await newTab(page, 'a.com');
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
  });

  test('the Settings button stays lit while Settings is open', async ({ page }) => {
    await openApp(page);
    const bg = () => page.getByTestId('btn-settings').evaluate((el) => getComputedStyle(el).backgroundColor);
    const before = await bg();
    await page.keyboard.press(`${MOD}+Comma`);
    await expect.poll(bg).not.toBe(before);
  });

  test('tab close buttons are at least 24px (WCAG 2.2 target size)', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    const b = (await page.locator('.row[data-active] .row-btn').first().boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(24);
  });
});

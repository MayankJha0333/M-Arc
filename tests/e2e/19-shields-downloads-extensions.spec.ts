import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, savedState, MOD } from './fixtures';

const hooks = <T>(page: Page, fn: string, arg?: unknown) => page.evaluate(([f, a]) => new Function('t', 'arg', `return ${f}`)((window as any).__kiteTest, a), [fn, arg] as const) as Promise<T>;
const cssVar = (page: Page, name: string) => page.getByTestId('app').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

async function openPrivacy(page: Page) {
  await page.keyboard.press(`${MOD}+Comma`);
  await page.getByTestId('settings-privacy').click();
}

const entry = (over: Record<string, unknown>) => ({ id: 'dl-1', url: 'https://a.com/f.zip', name: 'f.zip', path: '/tmp/f.zip', kind: 'file', state: 'progressing', received: 512 * 1024, total: 2 * 1024 * 1024, speed: 256 * 1024, startedAt: 1, resumable: true, site: 'a.com', ...over });

test.describe('Shields and privacy settings', () => {
  test('the main process is told the choices at start and on every change; they persist', async ({ page }) => {
    await openApp(page);
    expect(await hooks(page, 't.prefs')).toMatchObject({ httpsOnly: true, sendGpc: true, askWhereToSave: false, shields: { enabled: true, ads: true, trackers: true, cookieBanners: false, allow: [] } });
    await openPrivacy(page);
    await page.getByTestId('shields-cookies').click();
    await page.getByTestId('set-https').click();
    await page.getByTestId('set-ask-save').click();
    await expect.poll(() => hooks(page, 't.prefs')).toMatchObject({ httpsOnly: false, askWhereToSave: true, shields: { cookieBanners: true } });
    const s = await savedState(page);
    expect(s.settings.shields.cookieBanners).toBe(true);
    expect(s.settings.httpsOnly).toBe(false);
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    expect(await hooks(page, 't.prefs')).toMatchObject({ httpsOnly: false, shields: { cookieBanners: true } });
  });

  test('exceptions: add a site (any way you type it), no duplicates, remove it', async ({ page }) => {
    await openApp(page);
    await openPrivacy(page);
    await page.getByTestId('shields-allow-input').fill('https://www.Example.com/some/page');
    await page.getByTestId('shields-allow-add').click();
    await page.getByTestId('shields-allow-input').fill('example.com');
    await page.getByTestId('shields-allow-add').click();
    await expect(page.getByTestId('shields-allow-list').locator('.chip')).toHaveText(['example.com ×']);
    await page.getByTestId('shields-allow-input').fill('not a site!');
    await page.getByTestId('shields-allow-add').click();
    await expect(page.getByTestId('toast').last()).toContainText('example.com');
    await expect(page.getByTestId('shields-allow-list').locator('.chip')).toHaveCount(1);
    await page.getByLabel('Remove example.com').click();
    await expect(page.getByTestId('shields-allow-list').locator('.chip')).toHaveCount(0);
    expect((await hooks<{ shields: { allow: string[] } }>(page, 't.prefs')).shields.allow).toEqual([]);
  });

  test('turning Shields off greys out its options; lists can be updated by hand', async ({ page }) => {
    await openApp(page);
    await openPrivacy(page);
    await expect(page.getByTestId('shields-status')).toContainText('built into Kite');
    await page.getByTestId('shields-refresh').click();
    await expect(page.getByTestId('shields-status')).toContainText('Full filter lists');
    await page.getByTestId('shields-enabled').click();
    await expect(page.locator('.settings-sub')).toHaveAttribute('data-off', 'true');
    await expect(page.getByTestId('shields-refresh')).toHaveCount(0);
  });

  test('address bar: shows how secure the page is, what was blocked, and a per-site switch', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'https://news.example.com');
    await expect(page.getByTestId('url-security')).toHaveAttribute('data-level', 'secure');
    const id = await page.locator('.row[data-active]').getAttribute('data-testid');
    await hooks(page, 't.shieldsCount(arg, 12)', id!.replace('row-', ''));
    await expect(page.getByTestId('url-blocked')).toHaveText('12');
    await page.getByTestId('url-blocked').click();
    await expect(page.getByTestId('site-info-title')).toHaveText('Connection is secure');
    await expect(page.getByTestId('site-info-blocked')).toContainText('12 ads and trackers blocked');
    await page.getByTestId('site-info-shields').click();
    await expect(page.getByTestId('site-info')).toHaveCount(0);
    expect((await hooks<{ shields: { allow: string[] } }>(page, 't.prefs')).shields.allow).toEqual(['news.example.com']);
    await page.getByTestId('url-security').click();
    await expect(page.getByTestId('site-info-blocked')).toHaveText('Off for this site');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('site-info')).toHaveCount(0);

    await newTab(page, 'http://plain.example.org');
    await expect(page.getByTestId('url-security')).toHaveAttribute('data-level', 'insecure');
    await page.getByTestId('url-security').click();
    await expect(page.getByTestId('site-info-title')).toHaveText('Not secure');
    await page.getByTestId('site-info-clear').click();
    expect(await hooks<string[]>(page, 't.calls')).toContain('clear:plain.example.org:cookies+storage');
  });

  test('site permissions are listed and can be forgotten; clearing data asks first', async ({ page }) => {
    await openApp(page);
    await hooks(page, 't.permissions = arg', [
      { site: 'meet.example.com', permission: 'media', label: 'use your camera or microphone', allowed: true },
      { site: 'spam.example.com', permission: 'notifications', label: 'show notifications', allowed: false },
    ]);
    await openPrivacy(page);
    await expect(page.locator('.perm-row')).toHaveCount(2);
    await expect(page.locator('.perm-row').nth(1)).toContainText('may not show notifications');
    await page.locator('.perm-row').first().getByLabel('Forget').click();
    await expect(page.locator('.perm-row')).toHaveCount(1);
    await page.getByTestId('clear-cache').click();
    await page.getByTestId('clear-data').click();
    expect(await hooks<string[]>(page, 't.calls.filter((c) => c.startsWith("clear:"))')).toEqual([]);
    await page.getByTestId('clear-data-confirm').click();
    expect(await hooks<string[]>(page, 't.calls')).toContain('clear:*:cookies+storage');
    await expect(page.getByTestId('toast').last()).toContainText('cleared');
  });
});

test.describe('Downloads panel', () => {
  test('shows progress, pause/resume/cancel, finished files, and clears the list', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('btn-downloads')).toHaveCount(0); // nothing downloaded: no button
    await hooks(page, 't.setDownloads(arg)', [entry({}), entry({ id: 'dl-2', name: 'photo.png', kind: 'image', state: 'completed', received: 3_000_000, total: 3_000_000 }), entry({ id: 'dl-3', name: 'bad.mp4', kind: 'video', state: 'failed', error: 'The connection was lost' })]);
    await expect(page.getByTestId('btn-downloads')).toHaveAttribute('data-active', 'true');
    await page.keyboard.press(`${MOD}+Shift+j`);
    await expect(page.getByTestId('downloads')).toBeVisible();
    const live = page.getByTestId('download-dl-1');
    await expect(live.getByTestId('download-status')).toContainText('512 KB of 2.0 MB · 256 KB/s · 6 s left');
    await expect(live.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await live.getByTestId('download-pause').click();
    await expect(live).toHaveAttribute('data-state', 'paused');
    await live.getByTestId('download-resume').click();
    await expect(live).toHaveAttribute('data-state', 'progressing');
    await expect(page.getByTestId('download-dl-3').getByTestId('download-status')).toContainText('The connection was lost');
    await page.getByTestId('download-dl-2').getByTestId('download-reveal').click();
    await live.getByTestId('download-cancel').click();
    await expect(live.getByTestId('download-status')).toHaveText('Cancelled');
    expect(await hooks<string[]>(page, 't.calls')).toEqual(expect.arrayContaining(['download:pause:dl-1', 'download:resume:dl-1', 'download:reveal:dl-2', 'download:cancel:dl-1']));
    await page.getByTestId('downloads-clear').click();
    await expect(page.getByTestId('downloads-empty')).toBeVisible();
  });

  test('finishing a download tells you, and a failure says why', async ({ page }) => {
    await openApp(page);
    await hooks(page, 't.downloadDone(arg)', entry({ state: 'completed', name: 'report.pdf' }));
    await expect(page.getByTestId('toast').last()).toContainText('Downloaded “report.pdf”');
    await hooks(page, 't.downloadDone(arg)', entry({ state: 'failed', name: 'show.ts', error: 'This video is copy-protected (DRM), so it can’t be downloaded.' }));
    await expect(page.getByTestId('toast').last()).toContainText('copy-protected');
  });

  test('media on the page: download a video, or pick a quality for a stream', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'https://video.example.com');
    await page.keyboard.press(`${MOD}+Shift+j`);
    await expect(page.getByTestId('page-media')).toContainText('No downloadable video');
    await hooks(page, 't.media = arg', [
      { url: 'https://cdn.example.com/clip.mp4', kind: 'video', mime: 'video/mp4', size: 8_400_000, label: 'clip.mp4' },
      { url: 'https://cdn.example.com/master.m3u8', kind: 'stream', mime: 'application/vnd.apple.mpegurl', size: 0, label: 'master.m3u8' },
    ]);
    await hooks(page, 't.hlsVariants = arg', [{ url: 'https://cdn.example.com/1080.m3u8', label: '1080p', height: 1080, bandwidth: 5e6 }, { url: 'https://cdn.example.com/480.m3u8', label: '480p', height: 480, bandwidth: 1e6 }]);
    await page.getByTestId('media-rescan').click();
    await expect(page.getByTestId('media-item')).toHaveCount(2);
    await expect(page.getByTestId('media-item').first()).toContainText('8.0 MB');
    await page.getByTestId('media-download').click();
    await page.getByTestId('media-quality').click();
    await expect(page.getByTestId('media-qualities').locator('button')).toHaveText(['1080p', '480p']);
    await page.getByTestId('media-qualities').getByText('480p').click();
    expect(await hooks<string[]>(page, 't.calls')).toEqual(expect.arrayContaining(['media:https://cdn.example.com/clip.mp4', 'hls:https://cdn.example.com/480.m3u8']));
  });
});

test.describe('Extensions panel', () => {
  const preview = { token: 'tok1', source: 'store', name: 'Dark Pages', version: '2.1.0', description: 'Dark mode everywhere', manifestVersion: 3, access: ['Read and change everything on every website you visit', 'Save its own settings'], sites: ['All websites'], limits: ['Its toolbar button isn’t shown; open its popup from Settings → Extensions'], hasPopup: true, hasOptions: true };

  test('install is reviewed first: access and limits are shown, cancel installs nothing', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('Extensions');
    await page.getByTestId('cb-result-action').first().click();
    await expect(page.getByTestId('ext-empty')).toBeVisible();
    await expect(page.getByTestId('ext-support')).toContainText('What works');
    await hooks(page, 't.extensionPreview = arg', preview);
    await page.getByTestId('ext-store-input').fill('https://chromewebstore.google.com/detail/dark/abcdefghijklmnopabcdefghijklmnop');
    await page.getByTestId('ext-store-add').click();
    await expect(page.getByTestId('ext-review')).toContainText('Add “Dark Pages”?');
    await expect(page.getByTestId('ext-access')).toContainText('every website');
    await expect(page.getByTestId('ext-limits')).toContainText('toolbar button');
    await page.getByTestId('ext-cancel').click();
    await expect(page.getByTestId('ext-empty')).toBeVisible();
  });

  test('add, open popup and options, turn off and on, remove (asks first)', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-links').click();
    await page.getByTestId('settings-open-extensions').click();
    await hooks(page, 't.extensionPreview = arg', preview);
    await page.getByTestId('ext-add-file').click();
    await page.getByTestId('ext-install').click();
    await expect(page.getByTestId('toast').last()).toContainText('“Dark Pages” installed');
    const rowEl = page.getByTestId('ext-x-1');
    await expect(rowEl).toContainText('Dark Pages 2.1.0');
    await expect(rowEl).toContainText('1 thing may not work in Kite');
    await rowEl.getByTestId('ext-popup').click();
    await rowEl.getByTestId('ext-options').click();
    expect(await hooks<string[]>(page, 't.calls')).toEqual(expect.arrayContaining(['extOpen:x-1:popup', 'extOpen:x-1:options']));
    await rowEl.getByTestId('ext-toggle').click();
    await expect(rowEl.getByTestId('ext-popup')).toHaveCount(0); // off: nothing to open
    await rowEl.getByTestId('ext-toggle').click();
    await rowEl.getByTestId('ext-remove').click();
    await expect(rowEl).toBeVisible(); // not removed until confirmed
    await rowEl.getByTestId('ext-remove-confirm').click();
    await expect(page.getByTestId('ext-empty')).toBeVisible();
  });

  test('a bad file or link shows the reason and installs nothing', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-links').click();
    await page.getByTestId('settings-open-extensions').click();
    await hooks(page, 't.extensionPreview = arg', 'This is a Chrome theme, not an extension.');
    await page.getByTestId('ext-add-folder').click();
    await expect(page.getByTestId('ext-error')).toContainText('Chrome theme');
    await expect(page.getByTestId('ext-review')).toHaveCount(0);
  });
});

test.describe('Spaces with separate logins, and animation settings', () => {
  test('a Space’s tabs use its own cookie jar; Favorites and other Spaces use the shared one', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'https://mail.example.com');
    await expect(page.locator('.surface-slot[data-visible] iframe')).toHaveAttribute('data-partition', 'persist:kite');
    await page.getByTestId('btn-new-space').click();
    await page.getByTestId('space-name-input').fill('Work');
    await page.getByTestId('space-isolated').click();
    await expect(page.getByTestId('toast').last()).toContainText('its own logins');
    await page.getByTestId('space-done').click();
    await expect(page.getByTestId('space-isolated-badge')).toBeVisible();
    await newTab(page, 'https://mail.example.com');
    await expect(page.locator('.surface-slot[data-visible] iframe')).toHaveAttribute('data-partition', /^persist:kite-space-/);
    const s = await savedState(page);
    expect(s.spaces.map((x: { isolated?: boolean }) => !!x.isolated)).toEqual([false, true]);
    // Turning it off puts the tab back on the shared jar (it reloads).
    await page.getByTestId('space-name').dblclick();
    await page.getByTestId('space-isolated').click();
    await page.getByTestId('space-done').click();
    await expect(page.getByTestId('space-isolated-badge')).toHaveCount(0);
    await expect(page.locator('.surface-slot[data-visible] iframe')).toHaveAttribute('data-partition', 'persist:kite');
    // The first Space was never affected.
    await page.keyboard.press('Control+1');
    await expect(page.locator('.surface-slot[data-visible] iframe')).toHaveAttribute('data-partition', 'persist:kite');
  });

  test('animation speed and feel change every animation, persist, and reset with appearance', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    expect(await cssVar(page, '--dur')).toBe('220ms');
    expect(await cssVar(page, '--speed')).toBe('1');
    await page.getByTestId('set-speed').fill('2');
    expect(await cssVar(page, '--dur')).toBe('110ms');
    expect(await cssVar(page, '--speed')).toBe('0.5');
    await page.getByTestId('set-feel-bouncy').click();
    expect(await cssVar(page, '--dur')).toBe('160ms');
    expect(await cssVar(page, '--ease')).toContain('1.45');
    // A hard-coded duration elsewhere in the stylesheet follows the speed too.
    const sheetAnim = await page.getByTestId('settings').evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(sheetAnim)).toBeCloseTo(0.176, 2);
    expect((await savedState(page)).settings).toMatchObject({ motionSpeed: 2, motionFeel: 'bouncy' });
    await page.getByTestId('set-reset-appearance').click();
    expect(await cssVar(page, '--dur')).toBe('220ms');
    await page.getByTestId('set-motion').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-motion', 'reduced');
    expect(await page.getByTestId('settings').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

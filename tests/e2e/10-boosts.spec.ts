import { test, expect, openApp, newTab, visibleFrame, savedState, MOD } from './fixtures';

test.describe('boosts', () => {
  test('⌘⌥B opens a Boost for the current site; CSS applies live', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'news.example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await expect(page.getByTestId('boost-editor')).toContainText('news.example.com');
    await page.getByTestId('boost-css').fill('#title { color: rgb(1, 2, 3) !important; }');
    await expect(visibleFrame(page).locator('#title')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(page.getByTestId('url-boost')).toBeVisible();
  });

  test('zap: click an element on the page to hide it; remove the chip to bring it back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'news.example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-zap').click();
    await expect(page.getByTestId('zap-hint')).toBeVisible();
    await expect(page.getByTestId('boost-editor')).toHaveCount(0);
    await visibleFrame(page).locator('#ad').click();
    await expect(page.getByTestId('boost-editor')).toBeVisible();
    await expect(page.getByTestId('zap-chip')).toHaveCount(1);
    await expect(visibleFrame(page).locator('#ad')).toBeHidden();
    await page.getByTestId('zap-chip').getByRole('button').click();
    await expect(visibleFrame(page).locator('#ad')).toBeVisible();
  });

  test('zap can be cancelled with Esc', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'news.example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-zap').click();
    await visibleFrame(page).locator('#lede').hover();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('boost-editor')).toBeVisible();
    await expect(page.getByTestId('zap-chip')).toHaveCount(0);
  });

  test('font override and on/off switch', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'news.example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-font').selectOption({ label: 'Monospace' });
    await expect(visibleFrame(page).locator('#lede')).toHaveCSS('font-family', /monospace/);
    await page.getByTestId('boost-enabled').click();
    await expect(visibleFrame(page).locator('#lede')).not.toHaveCSS('font-family', /monospace/);
    await expect(page.getByTestId('url-boost')).toHaveCount(0);
  });

  test('a Boost applies to every page of the site and its subdomains, after reloads too', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-css').fill('body { background: rgb(9, 9, 9) !important; }');
    await page.getByTestId('boost-done').click();
    await newTab(page, 'blog.example.com/post');
    await expect(visibleFrame(page).locator('body')).toHaveCSS('background-color', 'rgb(9, 9, 9)');
    await newTab(page, 'unrelated.com');
    await expect(visibleFrame(page).locator('body')).not.toHaveCSS('background-color', 'rgb(9, 9, 9)');
  });

  test('scripts run when the page loads', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-js').fill('document.body.dataset.boosted = "yes";');
    await expect(page.locator('.warn')).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByTestId('boost-done').click();
    await page.keyboard.press(`${MOD}+r`);
    await expect(visibleFrame(page).locator('body')).toHaveAttribute('data-boosted', 'yes');
  });

  test('Boosts list: add by domain, toggle, edit, delete, export without scripts', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('manage boosts');
    await page.keyboard.press('Enter');
    await page.getByTestId('boost-new-domain').fill('https://www.video.example/watch');
    await page.getByTestId('boost-new').click();
    await expect(page.getByTestId('boost-editor')).toContainText('video.example');
    await page.getByTestId('boost-js').fill('alert(1)');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'All Boosts' }).click();
    await expect(page.getByTestId('boost-row')).toHaveCount(1);
    await page.getByTestId('boost-toggle-video.example').click();
    let s = await savedState(page);
    expect(s.boosts[0].enabled).toBe(false);
    await page.getByTestId('boosts-export').click();
    const exported = await page.evaluate(() => window.__kiteTest!.exported);
    expect(exported[0].name).toBe('kite-boosts.json');
    expect(exported[0].text).toContain('video.example');
    expect(exported[0].text).not.toContain('alert(1)');
    await page.getByTestId('boost-edit').click();
    await page.getByTestId('boost-delete').click();
    await expect(page.getByTestId('boost-row')).toHaveCount(0);
    s = await savedState(page);
    expect(s.boosts).toEqual([]);
  });

  test('import Boosts from a file', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('manage boosts');
    await page.keyboard.press('Enter');
    await page.getByTestId('boosts-import').setInputFiles({
      name: 'b.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ kind: 'kite-boosts', boosts: [{ name: 'Calm', domain: 'calm.example', css: 'p{}', zaps: ['#x'], js: 'evil()' }] })),
    });
    await expect(page.getByTestId('boost-row')).toHaveCount(1);
    const s = await savedState(page);
    expect(s.boosts[0]).toMatchObject({ name: 'Calm', domain: 'calm.example', js: '', zaps: ['#x'] });
  });

  test('the master switch turns every Boost off', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'example.com');
    await page.keyboard.press(`${MOD}+Alt+b`);
    await page.getByTestId('boost-css').fill('#title { color: rgb(1, 2, 3) !important; }');
    await expect(visibleFrame(page).locator('#title')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await page.getByRole('button', { name: 'All Boosts' }).click();
    await page.getByTestId('boosts-master').click();
    await expect(visibleFrame(page).locator('#title')).not.toHaveCSS('color', 'rgb(1, 2, 3)');
  });
});

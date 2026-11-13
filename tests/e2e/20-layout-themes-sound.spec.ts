import type { Page } from '@playwright/test';
import { test, expect, newTab, savedState, MOD } from './fixtures';

const hooks = <T>(page: Page, fn: string, arg?: unknown) => page.evaluate(([f, a]) => new Function('t', 'arg', `return ${f}`)((window as any).__kiteTest, a), [fn, arg] as const) as Promise<T>;
const sounds = (page: Page) => page.evaluate(() => [...((window as any).__kiteSounds as string[])]);
const cssVar = (page: Page, name: string) => page.getByTestId('app').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

/** The desktop app's layout (macOS window buttons and all), in a plain browser. */
async function openDesktop(page: Page) {
  await page.goto('/?platform=darwin&chrome=electron');
  await expect(page.getByTestId('sidebar')).toBeVisible();
}
const lastButtons = (page: Page) => hooks<{ visible: boolean; x: number; y: number }>(page, 't.windowButtons[t.windowButtons.length - 1]');

test.describe('layout: no wasted space around the page', () => {
  test('hiding the sidebar gives the page the whole window, with the same margin on every side', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://youtube.com');
    await page.keyboard.press(`${MOD}+s`);
    await expect(page.getByTestId('app')).toHaveAttribute('data-collapsed', 'true');
    await expect.poll(async () => (await page.getByTestId('page-card').boundingBox())!.x).toBe(8);
    const card = (await page.getByTestId('page-card').boundingBox())!;
    const vp = page.viewportSize()!;
    // 8px all round: there used to be a 36px empty band on top.
    expect([card.x, card.y, vp.width - card.x - card.width, vp.height - card.y - card.height]).toEqual([8, 8, 8, 8]);
    // The window buttons hide with the sidebar instead of needing that band…
    expect(await lastButtons(page)).toMatchObject({ visible: false });
    // …and come back, inside the sidebar, when it slides out.
    await page.getByTestId('edge-hotzone').hover();
    await expect(page.getByTestId('app')).toHaveAttribute('data-sidebar-peek', 'true');
    expect(await lastButtons(page)).toEqual({ visible: true, x: 22, y: 22 });
    await page.keyboard.press(`${MOD}+s`);
    expect(await lastButtons(page)).toEqual({ visible: true, x: 16, y: 16 });
  });

  test('with no margin chosen, the page touches every edge', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://a.com');
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('set-gap').fill('0');
    await page.getByTestId('sheet-close').click();
    await page.keyboard.press(`${MOD}+s`);
    await expect.poll(async () => (await page.getByTestId('page-card').boundingBox())!.x).toBe(0);
    const card = (await page.getByTestId('page-card').boundingBox())!;
    expect([card.y, card.width, card.height]).toEqual([0, page.viewportSize()!.width, page.viewportSize()!.height]);
  });

  test('sidebar on the right: the window buttons move into it and follow the window and sidebar size', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://a.com');
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('set-side-right').click();
    await page.getByTestId('sheet-close').click();
    const card = (await page.getByTestId('page-card').boundingBox())!;
    expect([card.x, card.y]).toEqual([8, 8]); // no band on top here either
    expect(await lastButtons(page)).toEqual({ visible: true, x: 1280 - 264 + 14, y: 16 });
    // The sidebar keeps room for them.
    await expect(page.locator('.sb-top')).toHaveAttribute('data-lights', 'true');
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(() => lastButtons(page)).toEqual({ visible: true, x: 1000 - 264 + 14, y: 16 });
  });

  test('full screen: no window buttons, so nothing is reserved for them anywhere', async ({ page }) => {
    await openDesktop(page);
    await expect(page.locator('.sb-top')).toHaveAttribute('data-lights', 'true');
    const before = (await page.getByTestId('btn-toggle-sidebar').boundingBox())!.x;
    await hooks(page, 't.windowState({ fullscreen: true })');
    await expect(page.getByTestId('app')).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.locator('.sb-top')).not.toHaveAttribute('data-lights', 'true');
    expect((await page.getByTestId('btn-toggle-sidebar').boundingBox())!.x).toBeLessThan(before - 60);
    expect(await lastButtons(page)).toMatchObject({ visible: false });
    await hooks(page, 't.windowState({ fullscreen: false })');
    await expect(page.locator('.sb-top')).toHaveAttribute('data-lights', 'true');
  });

  test('small windows: the sidebar gives way to the page; keyboard focus is always visible', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://a.com');
    await page.setViewportSize({ width: 720, height: 480 });
    await expect.poll(async () => (await page.getByTestId('sidebar').boundingBox())!.width).toBeLessThanOrEqual(216);
    expect((await page.getByTestId('page-card').boundingBox())!.width).toBeGreaterThan(490);
    await page.getByTestId('btn-settings').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await page.getByTestId('btn-settings').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  });
});

test.describe('themes', () => {
  test('a new Kite starts on the default theme', async ({ page }) => {
    await openDesktop(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await expect(page.getByTestId('look-theme-harbor')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('look-themes').locator('.look-theme')).toHaveCount(10);
  });

  test('every theme previews live, can be applied, and keeps text readable in light and dark', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://a.com');
    await page.keyboard.press(`${MOD}+Comma`);
    for (const id of ['daybreak', 'harbor', 'aurora', 'lagoon', 'ink', 'graphite', 'nebula', 'ember', 'sakura', 'moss']) {
      await page.getByTestId(`look-theme-${id}`).click();
      await expect(page.getByTestId(`look-theme-${id}`)).toHaveAttribute('aria-checked', 'true');
      for (const mode of ['light', 'dark']) {
        await page.getByTestId(`look-mode-${mode}`).click();
        await expect(page.getByTestId('app')).toHaveAttribute('data-theme', mode);
        await expect(page.getByTestId('look-readability'), `${id} ${mode}`).toHaveAttribute('data-ok', 'true');
        // The app still works under every look.
        await expect(page.locator('.row[data-active]')).toBeVisible();
      }
    }
    await page.getByTestId('look-theme-nebula').click();
    await page.getByTestId('look-apply').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-style', 'studio');
    const s = await savedState(page);
    expect(s.settings.look.style).toBe('studio');
    expect(s.spaces[0].theme.colors).toEqual(['#e5b8e8', '#8a4fc8']);
    // Changing one thing means it is no longer that ready-made theme.
    await page.getByTestId('look-shadow').fill('0.1');
    await expect(page.getByTestId('look-theme-nebula')).toHaveAttribute('aria-checked', 'false');
    // Undo brings the old look back whole.
    await page.getByTestId('look-discard').click();
    await page.getByText('Undo').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-style', 'calm');
    expect(await cssVar(page, '--tint-2')).toBe('#4a7fe0');
  });
});

test.describe('interface sounds', () => {
  test('tabs, Spaces, panels and downloads each have a sound', async ({ page }) => {
    await openDesktop(page);
    await newTab(page, 'https://a.com');
    await newTab(page, 'https://b.com');
    expect(await sounds(page)).toEqual(['pop', 'open', 'pop', 'open']);
    await page.keyboard.press(`${MOD}+w`);
    await page.getByTestId('btn-new-space').click();
    await page.getByTestId('space-done').click();
    await page.keyboard.press('Control+1');
    await hooks(page, 't.downloadDone(arg)', { id: 'd', url: 'u', name: 'a.zip', path: '/a.zip', kind: 'file', state: 'completed', received: 1, total: 1, speed: 0, startedAt: 1, resumable: true, site: 'a.com' });
    expect((await sounds(page)).slice(4)).toEqual(['close', 'pop', 'switch', 'done']);
  });

  test('they can be turned off, the volume is saved, and "Play" lets you hear it', async ({ page }) => {
    await openDesktop(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('set-volume').fill('0.8');
    await page.getByTestId('set-sounds').click();
    expect((await savedState(page)).settings).toMatchObject({ sounds: false, soundVolume: 0.8 });
    await page.getByTestId('sheet-close').click();
    const before = (await sounds(page)).length;
    await newTab(page, 'https://a.com');
    await page.keyboard.press(`${MOD}+w`);
    expect((await sounds(page)).length).toBe(before); // silence
    await page.keyboard.press(`${MOD}+Comma`);
    // Volume and Play are greyed out while sounds are off.
    await expect(page.locator('.look-inline-range[data-off]')).toHaveCount(1);
    await page.getByTestId('set-sounds').click();
    await page.getByTestId('set-sound-test').click();
    expect((await sounds(page)).pop()).toBe('done');
  });
});

import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, savedState, MOD } from './fixtures';

async function openAppearance(page: Page) {
  await page.keyboard.press(`${MOD}+Comma`);
  await expect(page.getByTestId('look-studio')).toBeVisible();
}

const app = (page: Page) => page.getByTestId('app');
const cssVar = (page: Page, name: string) => app(page).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test.describe('appearance studio: live preview', () => {
  test('a style previews on the whole window, but nothing is saved until Apply', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await openAppearance(page);
    await expect(page.getByTestId('look-apply')).toHaveCount(0);
    await page.getByTestId('look-style-paper').click();
    await expect(app(page)).toHaveAttribute('data-style', 'paper');
    await expect(app(page)).toHaveAttribute('data-previewing', 'true');
    await expect(page.getByTestId('page-card')).toHaveCSS('border-radius', '6px');
    expect((await savedState(page)).settings.look.style).toBe('calm');
    await page.getByTestId('look-apply').click();
    await expect(app(page)).not.toHaveAttribute('data-previewing', 'true');
    await expect.poll(async () => (await savedState(page)).settings.look.style).toBe('paper');
    expect((await savedState(page)).settings).toMatchObject({ radius: 6, font: 'bricolage' });
  });

  test('Discard puts the old look back', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    const before = await cssVar(page, '--backdrop');
    await page.getByTestId('look-style-studio').click();
    // The preview carries across pages: mode lives with the Space's colours.
    await page.getByTestId('settings-spaces').click();
    await page.getByTestId('look-mode-dark').click();
    await expect(app(page)).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('look-discard').click();
    await expect(app(page)).toHaveAttribute('data-style', 'calm');
    await expect(app(page)).toHaveAttribute('data-theme', 'light');
    expect(await cssVar(page, '--backdrop')).toBe(before);
  });

  test('Undo after Apply restores the previous look', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('look-style-glass').click();
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await savedState(page)).settings.look.style).toBe('glass');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await savedState(page)).settings.look.style).toBe('calm');
    await expect(app(page)).toHaveAttribute('data-style', 'calm');
  });

  test('closing Settings without applying throws the preview away (with a way back)', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('look-style-mono').click();
    await expect(app(page)).toHaveAttribute('data-style', 'mono');
    await page.keyboard.press('Escape');
    await expect(app(page)).toHaveAttribute('data-style', 'calm');
    await page.getByRole('button', { name: 'Apply it' }).click();
    await expect.poll(async () => (await savedState(page)).settings.look.style).toBe('mono');
  });

  test('palettes, hex codes, accent, surfaces and contrast all preview and save', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('settings-spaces').click();
    await page.getByTestId('look-palette-lagoon').click();
    expect(await cssVar(page, '--tint-2')).toBe('#2d8a9c');
    await page.getByTestId('look-color-0-hex').fill('#ABCDEF');
    await page.getByTestId('look-color-0-hex').press('Enter');
    expect(await cssVar(page, '--tint-1')).toBe('#abcdef');
    await page.getByTestId('look-color-1-hex').fill('nonsense');
    await page.getByTestId('look-color-1-hex').blur();
    await expect(page.getByTestId('look-color-1-hex')).toHaveValue('#2d8a9c');
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('look-accent-2').click();
    await page.getByTestId('look-backdrop-mesh').click();
    expect(await cssVar(page, '--backdrop')).toContain('radial-gradient');
    await page.getByTestId('look-glass').fill('1');
    expect(await cssVar(page, '--blur')).toBe('34px');
    await page.getByTestId('look-contrast-high').click();
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await savedState(page)).settings.look).toMatchObject({ accent: '#d9557a', backdrop: 'mesh', translucency: 1, contrast: 'high' });
    const s = await savedState(page);
    expect(s.spaces.find((x: { id: string }) => x.id === s.activeSpaceId).theme.colors).toEqual(['#abcdef', '#2d8a9c']);
  });

  test('layout controls follow the preview while one is open', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('look-style-paper').click();
    await page.getByTestId('settings-layout').click();
    await expect(page.getByTestId('set-radius')).toHaveValue('6');
    await page.getByTestId('set-radius').fill('10');
    expect(await cssVar(page, '--radius')).toBe('10px');
    expect((await savedState(page))?.settings.radius ?? 12).toBe(12);
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await savedState(page)).settings.radius).toBe(10);
  });

  test('readability check flags hard-to-read colours and Fix repairs them', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('settings-spaces').click();
    await page.getByTestId('look-color-0-hex').fill('#1a1a1a');
    await page.getByTestId('look-color-0-hex').press('Enter');
    await page.getByTestId('look-color-1-hex').fill('#000000');
    await page.getByTestId('look-color-1-hex').press('Enter');
    await page.getByTestId('look-intensity').fill('1');
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('look-style-studio').click();
    await expect(page.getByTestId('look-fix')).toBeVisible();
    await page.getByTestId('look-fix').click();
    await expect(page.getByTestId('look-readability')).toHaveAttribute('data-ok', 'true');
    const ratio = parseFloat((await page.getByTestId('look-text-ratio').textContent()) ?? '0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('theme codes: copy mine, paste one to preview it, reject junk', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await openAppearance(page);
    await page.getByTestId('look-style-studio').click();
    await page.getByTestId('settings-spaces').click();
    await page.getByTestId('look-palette-orchid').click();
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('look-copy').click();
    const code = await page.evaluate(() => navigator.clipboard.readText());
    expect(code).toMatch(/^kite-theme:/);
    await page.getByTestId('look-discard').click();
    await expect(app(page)).toHaveAttribute('data-style', 'calm');
    await page.getByTestId('look-code').fill('not a theme');
    await page.getByTestId('look-load').click();
    await expect(page.getByTestId('look-code-error')).toBeVisible();
    await page.getByTestId('look-code').fill(code);
    await page.getByTestId('look-load').click();
    await expect(app(page)).toHaveAttribute('data-style', 'studio');
    expect(await cssVar(page, '--tint-2')).toBe('#8a4fc8');
  });

  test('every style shows its own little preview', async ({ page }) => {
    await openApp(page);
    await openAppearance(page);
    for (const id of ['calm', 'glass', 'paper', 'mono', 'studio']) {
      await expect(page.getByTestId(`look-style-${id}`).locator('.mini')).toHaveAttribute('data-style', id);
    }
  });
});

test.describe('Spaces: background studio', () => {
  async function openBackground(page: Page) {
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-spaces').click();
    await expect(page.getByTestId('bg-kind')).toBeVisible();
  }

  test('design a gradient: type, angle, add, move and remove colours; Apply keeps it', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await page.getByTestId('bg-kind-conic').click();
    expect(await cssVar(page, '--backdrop')).toContain('conic-gradient(from 165deg');
    await page.getByTestId('bg-angle').fill('90');
    expect(await cssVar(page, '--backdrop')).toContain('conic-gradient(from 90deg');
    await page.getByTestId('bg-add-stop').click();
    await expect(page.locator('.grad-stop')).toHaveCount(3);
    await page.getByTestId('bg-stop-color-hex').fill('#ff8a5b');
    await page.getByTestId('bg-stop-color-hex').press('Enter');
    // Drag the middle colour toward the end.
    const bar = (await page.getByTestId('bg-bar').boundingBox())!;
    const mid = (await page.getByTestId('bg-stop-1').boundingBox())!;
    await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.8, mid.y + mid.height / 2, { steps: 5 });
    await page.mouse.up();
    // Clicking the bar adds one more; the bin removes the selected one.
    await page.mouse.click(bar.x + bar.width * 0.3, bar.y + bar.height / 2);
    await expect(page.locator('.grad-stop')).toHaveCount(4);
    await page.getByTestId('bg-stop-remove').click();
    await expect(page.locator('.grad-stop')).toHaveCount(3);
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => {
      const s = await savedState(page);
      return s.spaces.find((x: { id: string }) => x.id === s.activeSpaceId).theme.gradient;
    }).toMatchObject({ kind: 'conic', angle: 90 });
    const s = await savedState(page);
    const g = s.spaces.find((x: { id: string }) => x.id === s.activeSpaceId).theme.gradient;
    expect(g.stops).toHaveLength(3);
    expect(g.stops.find((x: { color: string }) => x.color === '#ff8a5b').at).toBeGreaterThanOrEqual(70);
    // Stops are saved in order.
    expect(g.stops.map((x: { at: number }) => x.at)).toEqual([...g.stops.map((x: { at: number }) => x.at)].sort((a, b) => a - b));
  });

  test('an animation moves the background behind the window, and Reduce Motion stops it', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await expect(page.locator('.bg-fx')).toHaveCount(0);
    await page.getByTestId('bg-motion-swirl').click();
    await expect(page.locator('.bg-fx')).toHaveAttribute('data-motion', 'swirl');
    expect(await page.locator('.bg-paint').evaluate((el) => getComputedStyle(el).animationName)).toBe('bg-swirl');
    await page.getByTestId('bg-motion-speed').fill('2');
    expect(await cssVar(page, '--bg-motion-dur')).toBe('15s');
    await page.getByTestId('look-apply').click();
    await page.getByTestId('settings-motion').click();
    await page.getByTestId('set-motion').click();
    expect(await page.locator('.bg-paint').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('the preview carries across Settings pages, and Reset clears the background', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await page.getByTestId('bg-kind-radial').click();
    await page.getByTestId('settings-appearance').click();
    await page.getByTestId('look-style-glass').click();
    await expect(page.getByTestId('look-apply')).toBeVisible();
    await page.getByTestId('settings-spaces').click();
    await expect(page.getByTestId('bg-kind-radial')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('bg-reset').click();
    await expect(page.getByTestId('bg-kind-simple')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('look-apply').click();
    const s = await savedState(page);
    expect(s.settings.look.style).toBe('glass');
    expect(s.spaces[0].theme.gradient).toBeUndefined();
  });

  test('searching "gradient" leads to the Spaces page', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-search').fill('gradient');
    await expect(page.getByTestId('settings-spaces')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-hit]')).toBeVisible();
  });
});

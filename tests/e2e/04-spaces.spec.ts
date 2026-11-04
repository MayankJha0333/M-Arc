import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, pinnedRows, activeRowTitle, savedState, visibleFrame, MOD } from './fixtures';

async function addSpace(page: Page, name: string, preset?: string) {
  await page.getByTestId('btn-new-space').click();
  await expect(page.getByTestId('space-editor')).toBeVisible();
  await page.getByTestId('space-name-input').fill(name);
  if (preset) await page.getByTestId(`preset-${preset}`).click();
  await page.getByTestId('space-done').click();
  await expect(page.getByTestId('space-editor')).toHaveCount(0);
}

function spaceBtn(page: Page, name: string) {
  return page.locator(`[data-testid^="space-"][data-name="${name}"]`);
}

test.describe('spaces', () => {
  test('create a Space, name it, and switch between Spaces', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'home.com');
    await addSpace(page, 'Work', 'Lagoon');
    await expect(page.getByTestId('space-name')).toHaveText('Work');
    await expect(todayRows(page)).toHaveCount(0);
    await newTab(page, 'work.com');
    await spaceBtn(page, 'Home').click();
    await expect(page.getByTestId('space-name')).toHaveText('Home');
    expect(await activeRowTitle(page)).toBe('home.com');
    await expect(visibleFrame(page).locator('#title')).toHaveText('home.com');
    await spaceBtn(page, 'Work').click();
    expect(await activeRowTitle(page)).toBe('work.com');
  });

  test('each Space has its own colors on the window', async ({ page }) => {
    await openApp(page);
    const before = await page.getByTestId('app').evaluate((el) => getComputedStyle(el).getPropertyValue('--tint-1'));
    await addSpace(page, 'Ocean', 'Lagoon');
    const after = await page.getByTestId('app').evaluate((el) => getComputedStyle(el).getPropertyValue('--tint-1'));
    expect(after.trim()).toBe('#9fd8d0');
    expect(after).not.toBe(before);
  });

  test('custom colors, appearance and strength apply live', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-edit-space').click();
    await page.getByTestId('color-a').fill('#123456');
    await expect(page.getByTestId('app')).toHaveCSS('--tint-1', '#123456');
    await page.getByTestId('space-mode-dark').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('space-mode-light').click();
    await expect(page.getByTestId('app')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('space-grain').click();
    await expect(page.getByTestId('app')).toHaveCSS('--grain-opacity', '0');
    await page.getByTestId('space-intensity').fill('0');
    const s = await savedState(page);
    expect(s.spaces[0].theme).toMatchObject({ colors: ['#123456', expect.any(String)], mode: 'light', grain: false, intensity: 0 });
  });

  test('icon from the picker or typed', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-edit-space').click();
    await page.locator('.emoji', { hasText: '🚀' }).click();
    await expect(page.locator('.space-header .space-icon')).toHaveText('🚀');
    await page.getByTestId('space-icon-input').fill('Z');
    await expect(page.locator('.space-header .space-icon')).toHaveText('Z');
  });

  test('⌃1/⌃2 and ⌘⌥→/← switch Spaces', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Two');
    await addSpace(page, 'Three');
    await page.keyboard.press('Control+1');
    await expect(page.getByTestId('space-name')).toHaveText('Home');
    await page.keyboard.press('Control+2');
    await expect(page.getByTestId('space-name')).toHaveText('Two');
    await page.keyboard.press(`${MOD}+Alt+ArrowRight`);
    await expect(page.getByTestId('space-name')).toHaveText('Three');
    await page.keyboard.press(`${MOD}+Alt+ArrowRight`);
    await expect(page.getByTestId('space-name')).toHaveText('Home');
    await page.keyboard.press(`${MOD}+Alt+ArrowLeft`);
    await expect(page.getByTestId('space-name')).toHaveText('Three');
  });

  test('two-finger swipe on the sidebar switches Spaces', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Two');
    await page.getByTestId('sb-scroll').hover();
    await page.mouse.wheel(140, 0);
    await expect(page.getByTestId('space-name')).toHaveText('Home');
    await page.waitForTimeout(500);
    await page.mouse.wheel(-140, 0);
    await expect(page.getByTestId('space-name')).toHaveText('Two');
  });

  test('drag a tab onto another Space moves it there', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Work');
    await spaceBtn(page, 'Home').click();
    await newTab(page, 'move-me.com');
    const row = todayRows(page).first();
    const a = (await row.boundingBox())!;
    const b = (await spaceBtn(page, 'Work').boundingBox())!;
    await page.mouse.move(a.x + 40, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(todayRows(page)).toHaveCount(0);
    await spaceBtn(page, 'Work').click();
    await expect(todayRows(page)).toHaveCount(1);
  });

  test('pinned tabs stay with their own Space', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+d`);
    await addSpace(page, 'Two');
    await expect(pinnedRows(page)).toHaveCount(0);
    await spaceBtn(page, 'Home').click();
    await expect(pinnedRows(page)).toHaveCount(1);
  });

  test('delete a Space (its tabs go to the Archive) and undo', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Temp');
    await newTab(page, 'temp.com');
    await spaceBtn(page, 'Temp').click({ button: 'right' });
    await page.getByTestId('menu-delete-space').click();
    await expect(spaceBtn(page, 'Temp')).toHaveCount(0);
    await expect(page.getByTestId('space-name')).toHaveText('Home');
    let s = await savedState(page);
    expect(s.archive[0].url).toBe('https://temp.com');
    await page.getByTestId('toast').getByText('Undo').click();
    await expect(spaceBtn(page, 'Temp')).toHaveCount(1);
    s = await savedState(page);
    expect(s.spaces).toHaveLength(2);
  });

  test('the only Space cannot be deleted', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('space-menu').click();
    await expect(page.getByTestId('menu-delete-space')).toBeDisabled();
  });

  test('reorder Spaces from the menu', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Two');
    await spaceBtn(page, 'Two').click({ button: 'right' });
    await page.getByTestId('menu-space-left').click();
    const names = await page.locator('[data-testid="space-bar"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names).toEqual(['Two', 'Home']);
  });

  test('Spaces survive restart, including which one was open', async ({ page }) => {
    await openApp(page);
    await addSpace(page, 'Work', 'Moss');
    await savedState(page);
    await page.reload();
    await expect(page.getByTestId('space-name')).toHaveText('Work');
    await expect(page.locator('[data-testid="space-bar"] [role="tab"]')).toHaveCount(2);
  });
});

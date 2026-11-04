import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, savedState, MOD } from './fixtures';

async function splitWith(page: Page, url: string) {
  await page.keyboard.press(`${MOD}+Shift+Equal`);
  await expect(page.locator('.cb-badge')).toHaveText('Split View');
  await page.getByTestId('cb-input').fill(url);
  await page.getByTestId('cb-input').press('Enter');
}

test.describe('split view', () => {
  test('⌘⇧= opens a page next to the current one', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'left.com');
    await splitWith(page, 'right.com');
    await expect(page.getByTestId('split-chrome')).toBeVisible();
    await expect(page.locator('.surface-slot[data-visible]')).toHaveCount(2);
    await expect(todayRows(page)).toHaveCount(1);
    await expect(todayRows(page).first()).toHaveAttribute('data-kind', 'split');
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'left.com | right.com');
    await expect(page.getByTestId('pane-1')).toHaveAttribute('data-focused', 'true');
    await expect(page.getByTestId('url-pill')).toHaveText('right.com');
  });

  test('panes sit side by side; flip stacks them', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    const box = async (i: number) => (await page.getByTestId(`pane-${i}`).boundingBox())!;
    expect((await box(1)).x).toBeGreaterThan((await box(0)).x + 100);
    await page.getByTestId('pane-flip-0').click();
    expect((await box(1)).y).toBeGreaterThan((await box(0)).y + 100);
    expect(Math.abs((await box(1)).x - (await box(0)).x)).toBeLessThan(2);
    // pages follow their frames
    const slots = await page.locator('.surface-slot[data-visible]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    const frame = Math.round((await box(0)).width);
    expect(slots.every((w) => Math.abs(w - frame) < 3)).toBe(true);
  });

  test('clicking a pane focuses it and the URL bar follows', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    await page.getByTestId('pane-0').locator('.pane-bar').click();
    await expect(page.getByTestId('pane-0')).toHaveAttribute('data-focused', 'true');
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
  });

  test('drag the divider to resize; double-click resets', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    const div = (await page.getByTestId('divider-0').boundingBox())!;
    await page.mouse.move(div.x + 5, div.y + 300);
    await page.mouse.down();
    await page.mouse.move(div.x - 200, div.y + 300, { steps: 6 });
    await page.mouse.up();
    let s = await savedState(page);
    const split = Object.values(s.items).find((x: any) => x.kind === 'split') as any;
    expect(split.sizes[0]).toBeLessThan(0.4);
    await page.getByTestId('divider-0').dblclick();
    s = await savedState(page);
    const split2 = Object.values(s.items).find((x: any) => x.kind === 'split') as any;
    expect(split2.sizes).toEqual([0.5, 0.5]);
  });

  test('drag a sidebar tab onto the page to split with it', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'one.com');
    await newTab(page, 'two.com');
    const src = (await todayRows(page).nth(1).boundingBox())!;
    const card = (await page.getByTestId('page-card').boundingBox())!;
    await page.mouse.move(src.x + 40, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width * 0.7, card.y + card.height / 2, { steps: 10 });
    await expect(page.getByTestId('page-card')).toHaveAttribute('data-over', 'true');
    await page.mouse.up();
    await expect(page.getByTestId('split-chrome')).toBeVisible();
    await expect(todayRows(page)).toHaveCount(1);
  });

  test('up to 4 panes; a fifth is refused', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'p1.com');
    for (const u of ['p2.com', 'p3.com', 'p4.com']) await splitWith(page, u);
    await expect(page.locator('.pane-frame')).toHaveCount(4);
    await splitWith(page, 'p5.com');
    await expect(page.getByTestId('toast').filter({ hasText: 'up to 4 pages' })).toHaveCount(1);
    await expect(page.locator('.pane-frame')).toHaveCount(4);
  });

  test('close a pane; with one left it becomes a normal tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    await splitWith(page, 'c.com');
    await page.getByTestId('pane-close-2').click();
    await expect(page.locator('.pane-frame')).toHaveCount(2);
    await page.getByTestId('pane-close-1').click();
    await expect(page.getByTestId('split-chrome')).toHaveCount(0);
    await expect(todayRows(page).first()).toHaveAttribute('data-kind', 'tab');
  });

  test('separate a pane back into its own tab; swap reorders', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    await splitWith(page, 'c.com');
    await page.getByTestId('pane-swap-0').click();
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'b.com | a.com | c.com');
    await page.getByTestId('pane-separate-2').click();
    await expect(todayRows(page)).toHaveCount(2);
    await expect(todayRows(page).nth(1)).toHaveAttribute('data-title', 'c.com');
  });

  test('“Separate All Pages” from the sidebar menu, and pages keep loaded (no reload)', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    const frameId = await page.locator('.surface-slot[data-visible] iframe').first().evaluate((f: HTMLIFrameElement) => ((f as any).__mark = Math.random()));
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-unsplit').click();
    await expect(todayRows(page)).toHaveCount(2);
    // The same iframe element survived (page wasn't reloaded)
    const still = await page.locator('iframe').evaluateAll((fs, m) => fs.some((f: any) => f.__mark === m), frameId);
    expect(still).toBe(true);
  });

  test('“Open in Split View” from a tab’s menu', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await todayRows(page).nth(1).click({ button: 'right' });
    await page.getByTestId('menu-split-with').click();
    await expect(page.locator('.pane-frame')).toHaveCount(2);
  });

  test('split survives restart', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await splitWith(page, 'b.com');
    await savedState(page);
    await page.reload();
    await expect(page.locator('.pane-frame')).toHaveCount(2);
    await expect(page.locator('.surface-slot[data-visible]')).toHaveCount(2);
  });
});

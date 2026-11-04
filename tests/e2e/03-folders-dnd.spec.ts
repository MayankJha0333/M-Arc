import type { Locator, Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, pinnedRows, MOD } from './fixtures';

/** Drag with a real mouse. `where` picks the spot on the target (top/middle/bottom). */
async function drag(page: Page, from: Locator, to: Locator, where: 'top' | 'middle' | 'bottom' | 'left' | 'right' = 'middle') {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 3 });
  const x = where === 'left' ? b.x + 4 : where === 'right' ? b.x + b.width - 4 : b.x + b.width / 2;
  const y = where === 'top' ? b.y + 3 : where === 'bottom' ? b.y + b.height - 3 : b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

async function titles(rows: Locator) {
  return rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-title')));
}

test.describe('folders', () => {
  test('⌘⌥F creates a folder and starts renaming it', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Alt+f`);
    await expect(page.getByTestId('rename-input')).toBeFocused();
    await page.getByTestId('rename-input').fill('Work');
    await page.getByTestId('rename-input').press('Enter');
    await expect(page.locator('.folder-row')).toHaveAttribute('data-title', 'Work');
  });

  test('“Move to Folder → New Folder” wraps a tab; click toggles open/closed', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-move-folder').click();
    await page.getByTestId('menu-new-folder-with').click();
    await page.getByTestId('rename-input').press('Enter');
    const folder = page.locator('.folder');
    await expect(folder.locator('.folder-children [data-testid^="row-"]')).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(0);
    await folder.locator('.folder-row').click();
    await expect(folder).toHaveAttribute('data-collapsed', 'true');
    await expect(folder.locator('.folder-children')).toHaveCount(0);
    await folder.locator('.folder-row').click();
    await expect(folder.locator('.folder-children [data-testid^="row-"]')).toHaveCount(1);
  });

  test('move a tab into an existing folder from the menu', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.getByTestId('rename-input').fill('Reading');
    await page.getByTestId('rename-input').press('Enter');
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-move-folder').click();
    await page.locator('[data-testid^="menu-folder-"]').click();
    await expect(page.locator('.folder-children [data-title="a.com"]')).toHaveCount(1);
  });

  test('delete folder archives its tabs and can be undone', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-move-folder').click();
    await page.getByTestId('menu-new-folder-with').click();
    await page.getByTestId('rename-input').fill('Gone');
    await page.getByTestId('rename-input').press('Enter');
    await page.locator('.folder-row').click({ button: 'right' });
    await page.getByTestId('menu-delete-folder').click();
    await expect(page.locator('.folder')).toHaveCount(0);
    await expect(page.getByTestId('toast').first()).toContainText('moved to Archive');
    await page.getByTestId('toast').getByText('Undo').click();
    await expect(page.locator('.folder .folder-children [data-title="a.com"]')).toHaveCount(1);
  });

  test('ungroup keeps the tabs', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-move-folder').click();
    await page.getByTestId('menu-new-folder-with').click();
    await page.getByTestId('rename-input').press('Enter');
    await page.locator('.folder-row').click({ button: 'right' });
    await page.getByTestId('menu-ungroup').click();
    await expect(page.locator('.folder')).toHaveCount(0);
    await expect(pinnedRows(page)).toHaveCount(1);
  });

  test('collapse all / expand all from the Space menu', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.getByTestId('rename-input').press('Enter');
    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.getByTestId('rename-input').press('Enter');
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-collapse-all').click();
    await expect(page.locator('.folder[data-collapsed]')).toHaveCount(2);
    await page.getByTestId('space-menu').click();
    await page.getByTestId('menu-expand-all').click();
    await expect(page.locator('.folder[data-collapsed]')).toHaveCount(0);
  });
});

test.describe('drag and drop', () => {
  test('reorder Today tabs by dragging', async ({ page }) => {
    await openApp(page);
    for (const u of ['a.com', 'b.com', 'c.com']) await newTab(page, u);
    expect(await titles(todayRows(page))).toEqual(['c.com', 'b.com', 'a.com']);
    await drag(page, todayRows(page).nth(0), todayRows(page).nth(2), 'bottom');
    expect(await titles(todayRows(page))).toEqual(['b.com', 'a.com', 'c.com']);
    await drag(page, todayRows(page).nth(2), todayRows(page).nth(0), 'top');
    expect(await titles(todayRows(page))).toEqual(['c.com', 'b.com', 'a.com']);
  });

  test('drag from Today to Pinned pins the tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await drag(page, todayRows(page).first(), page.getByTestId('pinned-end'));
    await expect(pinnedRows(page)).toHaveCount(1);
    await expect(todayRows(page)).toHaveCount(0);
  });

  test('drag into the middle of a folder drops inside it', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.getByTestId('rename-input').press('Enter');
    await newTab(page, 'a.com');
    await drag(page, todayRows(page).first(), page.locator('.folder-row'), 'middle');
    await expect(page.locator('.folder-children [data-title="a.com"]')).toHaveCount(1);
  });

  test('drag onto Favorites makes a favorite', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await drag(page, todayRows(page).first(), page.getByTestId('favorites'));
    await expect(page.locator('[data-testid^="fav-"]')).toHaveCount(1);
  });

  test('while dragging, a ghost follows and the drop line shows; Esc cancels', async ({ page }) => {
    await openApp(page);
    for (const u of ['a.com', 'b.com']) await newTab(page, u);
    const a = (await todayRows(page).nth(0).boundingBox())!;
    const b = (await todayRows(page).nth(1).boundingBox())!;
    await page.mouse.move(a.x + 40, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y + b.height - 3, { steps: 8 });
    await expect(page.getByTestId('drag-ghost')).toBeVisible();
    await expect(todayRows(page).nth(1)).toHaveAttribute('data-drop', 'after');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
    expect(await titles(todayRows(page))).toEqual(['b.com', 'a.com']);
  });

  test('a drag does not count as a click', async ({ page }) => {
    await openApp(page);
    for (const u of ['a.com', 'b.com']) await newTab(page, u);
    // b is active; dragging a must not select it
    await drag(page, todayRows(page).nth(1), todayRows(page).nth(0), 'top');
    await expect(page.locator('.row[data-active]')).toHaveAttribute('data-title', 'b.com');
  });
});

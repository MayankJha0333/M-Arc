import { test, expect, openApp, newTab, todayRows, activeRowTitle, savedState, visibleFrame, MOD } from './fixtures';

test.describe('sidebar tabs', () => {
  test('starts empty, opens a tab from the command bar', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await newTab(page, 'example.com');
    await expect(todayRows(page)).toHaveCount(1);
    await expect(page.getByTestId('url-pill')).toContainText('example.com');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(visibleFrame(page).locator('#title')).toHaveText('example.com');
  });

  test('typing words searches with the chosen engine', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'paper kites');
    await expect(page.getByTestId('url-pill')).toContainText('duckduckgo.com');
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'paper kites - Search');
  });

  test('new tabs go on top and become active; clicking switches pages', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await expect(todayRows(page).nth(0)).toHaveAttribute('data-title', 'b.com');
    await expect(todayRows(page).nth(1)).toHaveAttribute('data-title', 'a.com');
    expect(await activeRowTitle(page)).toBe('b.com');
    await todayRows(page).nth(1).click();
    expect(await activeRowTitle(page)).toBe('a.com');
    await expect(visibleFrame(page).locator('#title')).toHaveText('a.com');
    // Both pages stay alive (only one is visible)
    await expect(page.locator('.surface-slot')).toHaveCount(2);
    await expect(page.locator('.surface-slot[data-visible]')).toHaveCount(1);
  });

  test('close button removes the tab and Undo brings it back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    const row = todayRows(page).first();
    await row.hover();
    await row.locator('[data-testid^="close-"]').click();
    await expect(todayRows(page)).toHaveCount(1);
    expect(await activeRowTitle(page)).toBe('a.com');
    await page.getByTestId('toast').getByText('Undo').click();
    await expect(todayRows(page)).toHaveCount(2);
    expect(await activeRowTitle(page)).toBe('b.com');
  });

  test('⌘W closes, ⌘⇧T reopens', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await page.keyboard.press(`${MOD}+w`);
    await expect(todayRows(page)).toHaveCount(1);
    await page.keyboard.press(`${MOD}+Shift+t`);
    await expect(todayRows(page)).toHaveCount(2);
    expect(await activeRowTitle(page)).toBe('b.com');
  });

  test('shortcuts work while focus is inside a page', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await visibleFrame(page).locator('#lede').click();
    await page.keyboard.press(`${MOD}+t`);
    await expect(page.getByTestId('command-bar')).toBeVisible();
  });

  test('middle-click closes a tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await todayRows(page).nth(1).click({ button: 'middle' });
    await expect(todayRows(page)).toHaveCount(1);
  });

  test('rename by double-click: Enter saves, Escape cancels, empty restores page title', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    const row = todayRows(page).first();
    await row.dblclick();
    await page.getByTestId('rename-input').fill('My tab');
    await page.getByTestId('rename-input').press('Enter');
    await expect(row).toHaveAttribute('data-title', 'My tab');
    await row.dblclick();
    await page.getByTestId('rename-input').fill('Nope');
    await page.getByTestId('rename-input').press('Escape');
    await expect(row).toHaveAttribute('data-title', 'My tab');
    await row.dblclick();
    await page.getByTestId('rename-input').fill('');
    await page.getByTestId('rename-input').press('Enter');
    await expect(row).toHaveAttribute('data-title', 'a.com');
  });

  test('right-click menu duplicates a tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await todayRows(page).first().click({ button: 'right' });
    await page.getByTestId('menu-duplicate').click();
    await expect(todayRows(page)).toHaveCount(2);
  });

  test('links inside a page navigate the tab; back and forward work', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await expect(page.getByTestId('btn-back')).toBeDisabled();
    await visibleFrame(page).locator('#same').click();
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'a.com/page-2');
    await expect(page.getByTestId('url-pill')).toContainText('a.com/page-2');
    await expect(page.getByTestId('btn-back')).toBeEnabled();
    await page.getByTestId('btn-back').click();
    await expect(page.getByTestId('url-pill')).toHaveText('a.com');
    await expect(page.getByTestId('btn-forward')).toBeEnabled();
    await page.getByTestId('btn-forward').click();
    await expect(page.getByTestId('url-pill')).toContainText('page-2');
  });

  test('target=_blank links open a new tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await visibleFrame(page).locator('#blank').click();
    await expect(todayRows(page)).toHaveCount(2);
    expect(await activeRowTitle(page)).toBe('newtab.test');
  });

  test('⌘L edits the current tab instead of opening a new one', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+l`);
    await expect(page.getByTestId('cb-input')).toHaveValue('https://a.com');
    await page.getByTestId('cb-input').fill('b.com');
    await page.getByTestId('cb-input').press('Enter');
    await expect(todayRows(page)).toHaveCount(1);
    await expect(todayRows(page).first()).toHaveAttribute('data-title', 'b.com');
  });

  test('ctrl+tab cycles, ⌘1 jumps to the first item', async ({ page }) => {
    await openApp(page);
    for (const u of ['a.com', 'b.com', 'c.com']) await newTab(page, u);
    await page.keyboard.press('Control+Tab');
    expect(await activeRowTitle(page)).toBe('b.com');
    await page.keyboard.press(`${MOD}+9`);
    expect(await activeRowTitle(page)).toBe('a.com');
    await page.keyboard.press(`${MOD}+1`);
    expect(await activeRowTitle(page)).toBe('c.com');
  });

  test('tabs, titles and selection survive a restart', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await newTab(page, 'b.com');
    await todayRows(page).nth(1).click();
    const saved = await savedState(page);
    expect(Object.keys(saved.items)).toHaveLength(2);
    await page.reload();
    await expect(todayRows(page)).toHaveCount(2);
    expect(await activeRowTitle(page)).toBe('a.com');
    await expect(visibleFrame(page).locator('#title')).toHaveText('a.com');
  });

  test('sidebar hides with ⌘S and slides out from the edge', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+s`);
    await expect(page.getByTestId('app')).toHaveAttribute('data-collapsed', 'true');
    await page.mouse.move(3, 400);
    await expect(page.getByTestId('app')).toHaveAttribute('data-sidebar-peek', 'true');
    await page.mouse.move(800, 400);
    await expect(page.getByTestId('app')).not.toHaveAttribute('data-sidebar-peek', 'true');
    await page.keyboard.press(`${MOD}+s`);
    await expect(page.getByTestId('app')).not.toHaveAttribute('data-collapsed', 'true');
  });

  test('drag the sidebar edge to resize; double-click resets', async ({ page }) => {
    await openApp(page);
    const handle = page.getByTestId('sidebar-resizer');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 84, box.y + 300, { steps: 5 });
    await page.mouse.up();
    const w = await page.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeGreaterThan(330);
    await handle.dblclick();
    const w2 = await page.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(w2)).toBe(264);
  });

  test('find bar opens with ⌘F and closes with Escape', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await page.keyboard.press(`${MOD}+f`);
    await expect(page.getByTestId('find-bar')).toBeVisible();
    await page.getByTestId('find-input').fill('banner');
    await expect(visibleFrame(page).locator('body')).toHaveAttribute('data-find', 'banner');
    await page.getByTestId('find-input').press('Escape');
    await expect(page.getByTestId('find-bar')).toHaveCount(0);
  });
});

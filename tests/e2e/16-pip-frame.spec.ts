import { test, expect, openApp, newTab } from './fixtures';

// The frame Kite lays over the floating video (its own see-through window).
test.describe('floating video frame', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?platform=darwin&mode=pip');
    await expect(page.getByTestId('pip-frame')).toBeAttached();
  });

  test('draws a border; the buttons appear when you move the mouse over the video and fade away', async ({ page }) => {
    await expect(page.locator('.pip-frame-border')).toBeAttached();
    const bar = page.locator('.pip-frame-bar');
    await expect(bar).toHaveCSS('opacity', '0');
    await page.mouse.move(200, 120);
    await page.mouse.move(210, 125);
    await expect(page.getByTestId('pip-frame')).toHaveAttribute('data-shown');
    await expect(bar).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('pip-frame')).not.toHaveAttribute('data-shown', /.*/, { timeout: 4000 });
  });

  test('the page is see-through, so only the border and buttons cover the video', async ({ page }) => {
    for (const sel of ['html', 'body', '#root']) {
      await expect(page.locator(sel)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });

  test('Back, Minimize and Close send their action; the window takes clicks only over a button', async ({ page }) => {
    await page.mouse.move(100, 100);
    await page.mouse.move(110, 110);
    for (const [id, action] of [['pip-frame-back', 'back'], ['pip-frame-minimize', 'minimize'], ['pip-frame-close', 'close']] as const) {
      await page.getByTestId(id).hover();
      await page.getByTestId(id).click();
      expect(await page.evaluate(() => window.__kiteTest!.pipFrameActions.at(-1))).toBe(action);
    }
    const hovers = await page.evaluate(() => window.__kiteTest!.pipFrameHover);
    expect(hovers).toContain(true);
    expect(hovers.at(-1)).toBe(false); // released after the click
  });

  test('when minimized, the Minimize button turns into Restore', async ({ page }) => {
    await expect(page.getByTestId('pip-frame-minimize')).toHaveAttribute('aria-label', 'Minimize');
    await page.evaluate(() => window.__kiteTest!.pipFrameState({ compact: true }));
    await expect(page.getByTestId('pip-frame-minimize')).toHaveAttribute('aria-label', 'Restore size');
    await expect(page.getByTestId('pip-frame')).toHaveAttribute('data-compact');
  });
});

test('“Back to tab” on the floating video shows that tab in the main window', async ({ page }) => {
  await openApp(page);
  await newTab(page, 'video.example');
  const row = page.locator('[data-title="video.example"]');
  await expect(row).toHaveCount(1);
  const id = (await row.getAttribute('data-testid'))!.replace('row-', '');
  await newTab(page, 'other.example');
  await expect(row).not.toHaveAttribute('data-active');
  await page.evaluate((tabId) => window.__kiteTest!.focusTab(tabId), id);
  await expect(row).toHaveAttribute('data-active');
});

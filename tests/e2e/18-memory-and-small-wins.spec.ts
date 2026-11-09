import { test, expect, openApp, newTab, todayRows, savedState, MOD } from './fixtures';

const asleep = (page: import('@playwright/test').Page) => todayRows(page).and(page.locator('[data-asleep]'));

test.describe('memory: sleeping tabs', () => {
  test('only the most recent tabs stay awake; the rest sleep and wake when opened', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-tabs').click();
    await page.getByTestId('set-awake').fill('3');
    await expect.poll(async () => (await savedState(page)).settings.awakeTabs).toBe(3);
    await page.keyboard.press('Escape');
    for (const site of ['a.com', 'b.com', 'c.com', 'd.com', 'e.com']) await newTab(page, site);
    await expect(todayRows(page)).toHaveCount(5);
    await expect(asleep(page)).toHaveCount(2);
    // Pages of sleeping tabs are really gone.
    await expect(page.locator('.surface-slot')).toHaveCount(3);
    // Opening a sleeping tab wakes it.
    const sleeper = asleep(page).first();
    const id = (await sleeper.getAttribute('data-testid'))!;
    await sleeper.click();
    await expect(page.getByTestId(id)).not.toHaveAttribute('data-asleep', 'true');
    await expect(page.locator('.surface-slot')).toHaveCount(3);
  });

  test('put one tab to sleep from its menu, or all the others at once', async ({ page }) => {
    await openApp(page);
    for (const site of ['a.com', 'b.com', 'c.com']) await newTab(page, site);
    await expect(asleep(page)).toHaveCount(0);
    const other = todayRows(page).and(page.locator(':not([data-active])')).first();
    await other.click({ button: 'right' });
    await page.getByTestId('menu-sleep').click();
    await expect(asleep(page)).toHaveCount(1);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('Put Other Tabs to Sleep');
    await page.getByTestId('cb-input').press('Enter');
    await expect(asleep(page)).toHaveCount(2);
    await expect(page.locator('.row[data-active]')).not.toHaveAttribute('data-asleep', 'true');
  });
});

test.describe('small wins', () => {
  test('copy a tab as a Markdown link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await newTab(page, 'example.com');
    await page.locator('.row[data-active]').click({ button: 'right' });
    await page.getByTestId('menu-copy-md').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\[.+\]\(https:\/\/example\.com\/?\)$/);
  });

  test('mute all and unmute all are in the command bar', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+t`);
    await page.getByTestId('cb-input').fill('mute all');
    await expect(page.getByTestId('command-bar')).toContainText('Mute All Tabs');
    await page.getByTestId('cb-input').press('Enter');
    await expect(page.getByText('All tabs muted')).toBeVisible();
  });
});

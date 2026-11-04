export default async function (page) {
  const rows = () => page.locator('[data-testid=today-list] [data-testid^=row-]');
  // favorite figma + github, pin wiki, folder for hn
  for (const t of ['figma.com', 'github.com/torvalds/linux']) {
    await page.locator(`[data-testid=today-list] [data-title="${t}"]`).click({ button: 'right' });
    await page.click('[data-testid=menu-favorite]');
  }
  await page.locator('[data-testid=today-list] [data-title="en.wikipedia.org/wiki/Kite"]').click({ button: 'right' });
  await page.click('[data-testid=menu-pin]');
  await page.locator('[data-testid=today-list] [data-title="news.ycombinator.com"]').click({ button: 'right' });
  await page.click('[data-testid=menu-move-folder]');
  await page.click('[data-testid=menu-new-folder-with]');
  await page.fill('[data-testid=rename-input]', 'Reading list');
  await page.press('[data-testid=rename-input]', 'Enter');
  for (const u of ['dribbble.com/shots', 'linear.app']) { await page.keyboard.press('Meta+t'); await page.fill('[data-testid=cb-input]', u); await page.press('[data-testid=cb-input]', 'Enter'); await page.waitForTimeout(120); }
  await page.locator('[data-testid=today-list] [data-title="linear.app"]').click({ button: 'right' });
  await page.locator('[data-testid=menu-move-folder]').hover();
  await page.waitForTimeout(200);
}

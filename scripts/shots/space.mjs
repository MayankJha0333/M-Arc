export default async function (page) {
  await page.click('[data-testid=btn-new-space]');
  await page.fill('[data-testid=space-name-input]', 'Studio');
  await page.click('[data-testid=preset-Plum]');
  await page.locator('.emoji', { hasText: '🎨' }).click();
  await page.waitForTimeout(250);
}

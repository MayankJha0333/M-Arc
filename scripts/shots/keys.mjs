export default async function (page) {
  await page.keyboard.press('Meta+Comma');
  await page.click('[data-testid=settings-keys]');
  await page.waitForTimeout(300);
}

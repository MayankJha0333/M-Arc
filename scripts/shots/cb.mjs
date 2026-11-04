export default async function (page) {
  await page.keyboard.press('Meta+t');
  await page.fill('[data-testid=cb-input]', 'new');
  await page.waitForTimeout(250);
}

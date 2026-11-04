export default async function (page) {
  await page.keyboard.press('Meta+Shift+Equal');
  await page.fill('[data-testid=cb-input]', 'developer.mozilla.org/docs');
  await page.press('[data-testid=cb-input]', 'Enter');
  await page.waitForTimeout(300);
}

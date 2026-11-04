export default async function (page) {
  await page.keyboard.press('Meta+Comma');
  await page.waitForTimeout(300);
}

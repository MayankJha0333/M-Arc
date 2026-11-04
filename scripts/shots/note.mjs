export default async function (page) {
  await page.keyboard.press('Meta+Shift+o');
  await page.fill('[data-testid=note-title]', 'Weekend kite build');
  await page.press('[data-testid=note-title]', 'Enter');
  await page.keyboard.type('## Materials');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] Ripstop nylon, 1m');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Carbon spars');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> Fly it where the wind is steady and the trees are far.');
  await page.waitForTimeout(250);
}

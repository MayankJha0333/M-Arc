import { test, expect } from '@playwright/test';
import { launch, startSite, MOD } from './harness';

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(() => site.server.close());

async function open(win: import('@playwright/test').Page, url: string) {
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill(url);
  await win.getByTestId('cb-input').press('Enter');
}

test('real pages load in a webview and report their title', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-testid^="row-"][data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  await expect(win.locator('webview')).toHaveCount(1);
  await app.close();
});

test('state is saved to disk and restored on next launch', async () => {
  const first = await launch();
  await open(first.win, site.url('/'));
  await expect(first.win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  await first.win.waitForTimeout(800);
  await first.app.close();
  const second = await launch(first.userData);
  await expect(second.win.locator('[data-title="Kite Test Home"]')).toHaveCount(1);
  await second.app.close();
});

test('web pages cannot reach Node or Kite APIs', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  const result = await win.locator('webview').evaluate(async (wv: any) =>
    wv.executeJavaScript('[typeof require, typeof process, typeof window.kite].join(",")'),
  );
  expect(result).toBe('undefined,undefined,undefined');
  await app.close();
});

test('keyboard shortcuts typed inside a page reach Kite', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  // Send a real key press into the page's own web contents (as the OS would).
  await app.evaluate(({ webContents }) => {
    const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview')!;
    const mod = process.platform === 'darwin' ? 'meta' : 'control';
    guest.focus();
    guest.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: [mod] });
    guest.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: [mod] });
  });
  await expect(win.getByTestId('command-bar')).toBeVisible();
  await app.close();
});

test('target=_blank links open a new Kite tab', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  await win.locator('webview').evaluate((wv: any) => wv.executeJavaScript('document.getElementById("blank").click()'));
  await expect(win.locator('[data-title="Page Two"]')).toHaveCount(1, { timeout: 15000 });
  await app.close();
});

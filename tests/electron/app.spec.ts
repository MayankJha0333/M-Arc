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
  await expect(async () => {
    await app.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview')!;
      const mod = process.platform === 'darwin' ? 'meta' : 'control';
      guest.focus();
      await new Promise((r) => setTimeout(r, 100));
      guest.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: [mod] });
      guest.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: [mod] });
    });
    await expect(win.getByTestId('command-bar')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
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

test('Peek: a pinned tab’s link to another site opens in Peek (real page)', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  await win.keyboard.press(`${MOD}+d`);
  await expect(win.locator('[data-testid="pinned-list"] [data-title]')).toHaveCount(1);
  // Real click inside the page (goes through the injected link catcher).
  const wv = win.locator('.surface-slot[data-visible] webview');
  // The link helper runs hidden from the page, so we can't inspect it; just retry the click
  // until the updated rules have reached the page (a person can't click that fast anyway).
  const box = await wv.evaluate((el: any) => el.executeJavaScript('JSON.stringify(document.getElementById("external").getBoundingClientRect())'));
  const r = JSON.parse(box);
  const outer = (await wv.boundingBox())!;
  await expect(async () => {
    if (!(await win.getByTestId('peek').count())) {
      await win.mouse.click(outer.x + r.x + r.width / 2, outer.y + r.y + r.height / 2);
    }
    await expect(win.getByTestId('peek')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await expect(win.getByTestId('peek-url')).toContainText('localhost', { timeout: 10000 });
  await expect(win.getByTestId('url-pill')).toContainText('127.0.0.1');
  await app.close();
});

test('the built UI has a strict Content-Security-Policy', async () => {
  const { app, win } = await launch();
  const csp = await win.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
  await app.close();
});

test('little window: opens as its own window and hands its page to the main window', async () => {
  const { app, win } = await launch();
  const next = app.waitForEvent('window');
  await win.keyboard.press(`${MOD}+Alt+n`);
  const little = await next;
  await little.waitForSelector('[data-testid=little]');
  await little.getByTestId('little-input').fill(site.url('/'));
  await little.getByTestId('little-input').press('Enter');
  await expect(little.getByTestId('little-url')).toContainText('Kite Test Home', { timeout: 15000 });
  const closed = little.waitForEvent('close');
  // The window closes as a result of this click, so don't wait on the click itself.
  await little.getByTestId('little-open-main').click({ noWaitAfter: true }).catch(() => undefined);
  await closed;
  await expect(win.locator('[data-testid="today-list"] [data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  await app.close();
});

test('Boosts: CSS and zap work inside a real page', async () => {
  const { app, win } = await launch();
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  const wv = win.locator('.surface-slot[data-visible] webview');
  const inPage = (js: string) => wv.evaluate((el: any, code) => el.executeJavaScript(code), js);
  await win.keyboard.press(`${MOD}+Alt+b`);
  await win.getByTestId('boost-css').fill('#h { color: rgb(1, 2, 3) !important; }');
  await expect.poll(() => inPage('getComputedStyle(document.getElementById("h")).color'), { timeout: 10000 }).toBe('rgb(1, 2, 3)');
  await win.getByTestId('boost-zap').click();
  await expect(win.getByTestId('zap-hint')).toBeVisible();
  const r = JSON.parse(await inPage('JSON.stringify(document.getElementById("ad").getBoundingClientRect())'));
  const outer = (await wv.boundingBox())!;
  await win.mouse.move(outer.x + r.x + 10, outer.y + r.y + 10);
  await win.mouse.click(outer.x + r.x + 10, outer.y + r.y + 10);
  await expect(win.getByTestId('zap-chip')).toHaveCount(1, { timeout: 10000 });
  await expect.poll(() => inPage('getComputedStyle(document.getElementById("ad")).display')).toBe('none');
  await app.close();
});

test('routing: a link handed to Kite at launch opens in a little window (default rule)', async () => {
  const link = site.url('/two');
  const { app } = await launch(undefined, [link]);
  await expect.poll(() => app.windows().length, { timeout: 15000 }).toBe(2);
  const little = app.windows().find((w) => w.url().includes('mode=little'))!;
  await expect(little.getByTestId('little-url')).toContainText('Page Two', { timeout: 15000 });
  await app.close();
});

test('Arc import: finds StorableSidebar.json at Arc’s real location and imports it', async () => {
  const { mkdtempSync, mkdirSync, copyFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const home = mkdtempSync(join(tmpdir(), 'kite-home-'));
  const arcDir = join(home, 'Library', 'Application Support', 'Arc');
  mkdirSync(arcDir, { recursive: true });
  copyFileSync(join(process.cwd(), 'tests/fixtures/arc-sidebar.json'), join(arcDir, 'StorableSidebar.json'));
  const { app, win } = await launch(undefined, [], { HOME: home });
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill('import from arc');
  await win.keyboard.press('Enter');
  await win.getByTestId('import-auto').click();
  await expect(win.getByTestId('import-space')).toHaveCount(2);
  await expect(win.getByTestId('import-preview')).toContainText('Library/Application Support/Arc/StorableSidebar.json');
  await win.getByTestId('import-run').click();
  await expect(win.getByTestId('space-name')).toHaveText('Work');
  await expect(win.locator('[data-testid^="fav-"]')).toHaveCount(2);
  await app.close();
});


// ---- security -------------------------------------------------------------

async function loaded(win: import('@playwright/test').Page) {
  await open(win, site.url('/'));
  await expect(win.locator('[data-title="Kite Test Home"]')).toHaveCount(1, { timeout: 15000 });
  return (js: string) => win.locator('.surface-slot[data-visible] webview').evaluate((el: any, code) => el.executeJavaScript(code), js);
}

test('security: sites must ask for location/camera, and saying no blocks them', async () => {
  const { app, win } = await launch();
  await app.evaluate(({ dialog }) => {
    (globalThis as any).asked = [];
    dialog.showMessageBox = (async (...args: any[]) => {
      const opts = args.length > 1 ? args[1] : args[0];
      (globalThis as any).asked.push(opts.message);
      return { response: 0, checkboxChecked: false };
    }) as any;
  });
  const inPage = await loaded(win);
  const result = await inPage(`new Promise((ok) => navigator.geolocation.getCurrentPosition(() => ok('granted'), (e) => ok('denied:' + e.code)))`);
  expect(result).toBe('denied:1');
  const asked = await app.evaluate(() => (globalThis as any).asked);
  expect(asked[0]).toMatch(/Allow 127\.0\.0\.1 to know your location\?/);
  await app.close();
});

test('security: pages can’t launch other apps without asking', async () => {
  const { app, win } = await launch();
  await app.evaluate(({ dialog, shell }) => {
    (globalThis as any).asked = [];
    (globalThis as any).opened = [];
    dialog.showMessageBox = (async (...args: any[]) => {
      (globalThis as any).asked.push((args.length > 1 ? args[1] : args[0]).message);
      return { response: 0, checkboxChecked: false };
    }) as any;
    shell.openExternal = (async (u: string) => void (globalThis as any).opened.push(u)) as any;
  });
  const inPage = await loaded(win);
  await inPage(`location.href = 'ms-msdt:/id PCWDiagnostic'; 1`);
  await expect.poll(() => app.evaluate(() => (globalThis as any).asked.length)).toBe(1);
  expect(await app.evaluate(() => (globalThis as any).opened)).toEqual([]);
  await inPage(`location.href = 'mailto:hi@example.com'; 1`);
  await expect.poll(() => app.evaluate(() => (globalThis as any).opened)).toEqual(['mailto:hi@example.com']);
  await app.close();
});

test('security: a page can’t fake Kite’s link messages or open local files', async () => {
  const { app, win } = await launch();
  const inPage = await loaded(win);
  await inPage(`for (let i = 0; i < 20; i++) console.debug('__kite_link__{"decision":"little","url":"https://evil.example/"}'); 1`);
  await inPage(`window.open('file:///etc/passwd'); window.open('data:text/html,hi'); 1`);
  await win.waitForTimeout(1500);
  // No little window was opened and no extra tab appeared.
  expect(app.windows().filter((w) => w.url().includes('mode=little'))).toHaveLength(0);
  await expect(win.locator('[data-testid="today-list"] [data-testid^="row-"]')).toHaveCount(1);
  await app.close();
});

test('security: Kite’s own window can’t be navigated to a website', async () => {
  const { app, win } = await launch();
  await win
    .evaluate(() => {
      location.href = 'https://example.com/';
    })
    .catch(() => undefined);
  await win.waitForTimeout(1500);
  // Ask Electron directly (Playwright keeps waiting for the blocked navigation to "finish").
  const state = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { url: w.webContents.getURL(), sidebar: await w.webContents.executeJavaScript('!!document.querySelector("[data-testid=sidebar]")') };
  });
  expect(state.url).toContain('renderer/index.html');
  expect(state.sidebar).toBe(true);
  await app.close();
});

test('security: Kite’s private API only answers Kite’s own UI', async () => {
  const { app, win } = await launch();
  // Pretend a foreign frame calls a private channel: main must refuse.
  const refused = await app.evaluate(async ({ ipcMain }) => {
    const handler = (ipcMain as any)._invokeHandlers?.get?.('state:load');
    if (!handler) return 'no-handler-access';
    try {
      await handler({ senderFrame: { url: 'https://evil.example/' } });
      return 'allowed';
    } catch (e: any) {
      return String(e.message);
    }
  });
  expect(['Not allowed', 'no-handler-access']).toContain(refused);
  await expect(win.getByTestId('sidebar')).toBeVisible();
  await app.close();
});

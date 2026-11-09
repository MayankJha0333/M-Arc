// macOS only: the floating video, checked on the real desktop.
// Really switches to another app (Finder) and back, then inspects the floating window
// the way macOS sees it, uses Kite's controls on it, drags and resizes it through the
// same code a real drag uses, and checks Kite never crashed.
// Don't touch the mouse or keyboard while this runs (about a minute).

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, startSite, MOD } from '../electron/harness';

test.describe.configure({ mode: 'serial' });
test.skip(process.platform !== 'darwin', 'macOS only');

let app: ElectronApplication;
let win: Page;
let site: Awaited<ReturnType<typeof startSite>>;
const started = Date.now();
const DEBUG_LOG = process.env.KITE_MAC_TEST_LOG || join(tmpdir(), `kite-mac-test-${started}.log`);
const NS = { CanJoinAllSpaces: 1, FullScreenAuxiliary: 256 };

/** Run JavaScript in the test video's page. */
const video = (js: string) =>
  app.evaluate(async ({ webContents }, code) => {
    const wc = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().includes('/video'));
    return wc ? wc.executeJavaScript(code) : null;
  }, js);
const inPip = () => video('!!document.pictureInPictureElement');
const paused = () => video("document.getElementById('v').paused");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = <T>(fn: (h: any) => T) => app.evaluate((_e, f) => new Function('h', `return (${f})(h)`)((globalThis as any).__kiteTest), fn.toString()) as Promise<Awaited<T>>;
const inspect = () => hooks((h) => h.inspectPip());
const frameInfo = () => hooks((h) => h.pipFrame.frameInfo());
const controls = () => app.windows().find((p) => p.url().includes('mode=pip'));
const mainScreenHeight = () => app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds.height);

/** Switch to another app for real, the way you would. */
// (`open -a` needs no extra permission, unlike AppleScript.)
const switchAway = () => execFileSync('open', ['-a', 'Finder']);
const comeBack = () => app.evaluate(({ app: a, BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html') && !x.webContents.getURL().includes('mode='));
  a.focus({ steal: true });
  w?.show();
  w?.focus();
});

/** A screenshot of the floating video (needs Screen Recording permission for your terminal). */
async function shoot(name: string) {
  const info = await inspect();
  if (!info?.found || !info.frame) return;
  const h = await mainScreenHeight();
  const f = info.frame;
  const file = join(test.info().outputDir, `${name}.png`);
  try {
    execFileSync('screencapture', ['-x', '-R', `${Math.round(f.x) - 12},${Math.round(h - f.y - f.height) - 12},${Math.round(f.width) + 24},${Math.round(f.height) + 24}`, file]);
    if (existsSync(file)) await test.info().attach(name, { path: file, contentType: 'image/png' });
  } catch {
    /* no permission: carry on without the picture */
  }
}

/** Show Kite's controls (move the mouse over them) and press a button. */
async function press(id: string) {
  const page = controls();
  if (!page) throw new Error('Kite’s controls window is not open');
  await page.mouse.move(60, 60);
  await page.mouse.move(70, 64);
  await page.getByTestId(id).click();
}

test.beforeAll(async () => {
  site = await startSite();
  ({ app, win } = await launch(undefined, [], { KITE_DEBUG_LOG: DEBUG_LOG }));
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill(site.url('/video'));
  await win.getByTestId('cb-input').press('Enter');
  await expect(win.locator('[data-title="Video Page"] [data-testid^="sound-"]')).toBeVisible({ timeout: 20000 });
  await win.waitForTimeout(800);
});

test.afterAll(async () => {
  // Attach this run's Kite debug log to the report.
  await app?.close();
  site?.server.close();
});

test('switching to another app pops the playing video out', async () => {
  switchAway();
  await expect.poll(inPip, { timeout: 10000, message: 'the video should be floating after switching to Finder' }).toBe(true);
  await expect.poll(async () => (await inspect())?.found, { timeout: 5000, message: 'macOS should have a floating video window' }).toBe(true);
  await shoot('after-app-switch');
});

test('the floating window is a panel that can go over full-screen apps', async () => {
  const w = await inspect();
  expect(w?.found).toBe(true);
  expect(w?.isNonactivatingPanel, 'macOS must treat it as a non-activating panel').toBe(true);
  expect(w!.behavior & NS.CanJoinAllSpaces, 'shows on every desktop').toBeTruthy();
  expect(w!.behavior & NS.FullScreenAuxiliary, 'allowed over full-screen apps').toBeTruthy();
});

test('Kite’s controls cover it exactly, and Chromium’s own buttons can’t show', async () => {
  const w = await inspect();
  expect(w?.ignoresMouse, 'Chromium’s window must ignore the mouse (else its buttons and grey shade show)').toBe(true);
  expect(w?.hasShadow, 'its own shadow is off (it draws a pale outline)').toBe(false);
  await expect.poll(async () => (await frameInfo()).mode, { timeout: 5000 }).toBe('full');
  const h = await mainScreenHeight();
  const f = w!.frame!;
  const want = { x: Math.round(f.x), y: Math.round(h - f.y - f.height), width: Math.round(f.width), height: Math.round(f.height) };
  await expect.poll(async () => (await frameInfo()).bounds, { timeout: 3000, message: 'controls window should sit exactly on the video' }).toEqual(want);
  await controls()!.waitForSelector('[data-testid=pip-frame][data-mode=full]');
});

test('play and pause from Kite’s controls', async () => {
  await press('pip-play');
  await expect.poll(paused, { timeout: 5000 }).toBe(true);
  await press('pip-play');
  await expect.poll(paused, { timeout: 5000 }).toBe(false);
  await shoot('controls');
});

test('dragging moves the video and its controls together, without crashing', async () => {
  const before = (await inspect())!.frame!;
  const after = await hooks((h) => h.pipFrame.dragForTest('move', 120, -80));
  expect(after, 'the drag should report where the video ended up').toBeTruthy();
  expect(await app.evaluate(() => 1 + 1), 'Kite is still running').toBe(2);
  const now = (await inspect())!.frame!;
  expect(Math.round(now.x - before.x)).toBe(120);
  expect(Math.round(now.y - before.y)).toBe(80); // macOS measures up from the bottom
  await expect.poll(async () => (await frameInfo()).bounds).toEqual(after);
});

test('resizing from a corner keeps the video’s shape, and the controls follow', async () => {
  const before = (await inspect())!.frame!;
  const after = await hooks((h) => h.pipFrame.dragForTest('se', 90, 0));
  expect(await app.evaluate(() => 1 + 1)).toBe(2);
  const now = (await inspect())!.frame!;
  expect(now.width).toBeGreaterThan(before.width + 40);
  expect(Math.abs(now.height / now.width - before.height / before.width)).toBeLessThan(0.02);
  await expect.poll(async () => (await frameInfo()).bounds).toEqual(after);
  await shoot('after-resize');
});

test('Minimize turns it into the mini player; the video keeps playing', async () => {
  await press('pip-frame-minimize');
  await expect.poll(inPip, { timeout: 5000 }).toBe(false);
  expect(await paused()).toBe(false);
  await expect.poll(async () => (await frameInfo()).mode).toBe('mini');
  await controls()!.waitForSelector('[data-testid=pip-frame][data-mode=mini]');
  const b = (await frameInfo()).bounds!;
  const work = await app.evaluate(({ screen }, bb) => screen.getDisplayMatching(bb).workArea, b);
  expect(b.x + b.width).toBeGreaterThan(work.x + work.width - 40); // bottom-right corner
});

test('Show video pops the same video out again, as a panel with controls', async () => {
  await controls()!.getByTestId('pip-frame-show').click();
  await expect.poll(inPip, { timeout: 10000 }).toBe(true);
  await expect.poll(async () => (await frameInfo()).mode, { timeout: 5000 }).toBe('full');
  const w = await inspect();
  expect(w?.isNonactivatingPanel).toBe(true);
  expect(w?.ignoresMouse).toBe(true);
});

test('coming back to Kite puts the video back in its page', async () => {
  await comeBack();
  await expect.poll(inPip, { timeout: 10000 }).toBe(false);
  await expect.poll(async () => (await frameInfo()).mode, { timeout: 5000 }).toBe('hidden');
});

test('switching tabs pops the video out too', async () => {
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill(site.url('/two'));
  await win.getByTestId('cb-input').press('Enter');
  await expect.poll(inPip, { timeout: 10000 }).toBe(true);
  await expect.poll(async () => (await inspect())?.isNonactivatingPanel, { timeout: 5000 }).toBe(true);
  await expect.poll(async () => (await frameInfo()).mode, { timeout: 5000 }).toBe('full');
});

test('Close puts the video back in its tab, paused, and the controls go away', async () => {
  await press('pip-frame-close');
  await expect.poll(inPip, { timeout: 10000 }).toBe(false);
  expect(await paused()).toBe(true);
  await expect.poll(async () => (await frameInfo()).bounds).toBe(null);
});

test('Kite did not crash during the run (no new crash reports)', async () => {
  const dir = join(homedir(), 'Library/Logs/DiagnosticReports');
  const fresh = existsSync(dir)
    ? readdirSync(dir).filter((f) => /^(Electron|Kite)/.test(f) && statSync(join(dir, f)).mtimeMs > started)
    : [];
  for (const f of fresh) await test.info().attach(f, { path: join(dir, f), contentType: 'text/plain' });
  expect(fresh, `new crash reports: ${fresh.join(', ')}`).toEqual([]);
});

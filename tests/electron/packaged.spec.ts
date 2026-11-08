import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Runs only after `npm run dist:dir` has produced a packaged app.
const exe = ['release/linux-unpacked/kite-browser', 'release/mac-arm64/Kite.app/Contents/MacOS/Kite', 'release/mac/Kite.app/Contents/MacOS/Kite'].find((p) => existsSync(p));

test('the packaged app starts and works', async () => {
  test.skip(!exe, 'no packaged app found (run npm run dist:dir first)');
  const app = await electron.launch({ executablePath: exe!, args: ['--no-sandbox'], env: { ...process.env, KITE_USER_DATA: mkdtempSync(join(tmpdir(), 'kite-pkg-')), KITE_TEST: '1' } });
  const win = await app.firstWindow();
  await expect(win.getByTestId('sidebar')).toBeVisible();
  await expect(win.getByTestId('empty-state')).toBeVisible();
  const csp = await win.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  // The macOS window bridge (koffi) is shipped outside the archive and loads.
  const koffi = await app.evaluate(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return typeof (process as any).mainModule.require('koffi').load;
    } catch (e) {
      return String(e);
    }
  });
  expect(koffi).toBe('function');
  await app.close();
});

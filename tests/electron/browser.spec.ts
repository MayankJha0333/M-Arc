// Real-app tests for Shields, downloads, Spaces with separate logins, Chrome
// extensions, site permissions and load errors. Everything runs against a
// local test site; nothing here touches the internet or your real Downloads.

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { launch, MOD } from './harness';

// A lossless 1×1 WebP: Electron's own image reader can't open these, so this checks the real conversion path.
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const SEGMENTS = [Buffer.alloc(3000, 1), Buffer.alloc(2000, 2), Buffer.alloc(1000, 3)];
const BIG = Buffer.alloc(400_000, 7);

let server: Server;
let port = 0;
const url = (p = '/') => `http://127.0.0.1:${port}${p}`;
const requests: string[] = [];
let gpc = '';

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(path);
    if (path.startsWith('/priv')) gpc = `${req.headers['sec-gpc']}/${req.headers.dnt}`;
    const send = (type: string, body: string | Buffer, extra: Record<string, string> = {}) => {
      res.writeHead(200, { 'content-type': type, 'content-length': String(Buffer.byteLength(body)), ...extra });
      res.end(body);
    };
    if (path.startsWith('/ads'))
      return send(
        'text/html',
        `<!doctype html><title>Ads Page</title><h1>News</h1>
         <ins class="adsbygoogle" id="slot" style="display:block;height:50px">AD</ins>
         <p id="story">The story</p>
         <script src="http://stats.doubleclick.net/tracker.js"></script>
         <img src="http://www.google-analytics.com/collect?x=1">
         <script src="/own.js"></script>`,
      );
    if (path.startsWith('/own.js')) return send('text/javascript', 'document.documentElement.dataset.own = "1"');
    if (path.startsWith('/cookie')) return send('text/html', `<!doctype html><title>Cookie Page</title><script>if (location.search.includes('set')) document.cookie = 'who=first; path=/; max-age=3600'; document.title = 'cookie:' + (document.cookie || 'none');</script>`);
    if (path.startsWith('/files')) return send('text/html', `<!doctype html><title>Files</title><a id="doc" href="/report.txt" download>doc</a><a id="app" href="/setup.exe" download>app</a><img id="pic" src="/pic.webp"><video id="vid" src="/clip.mp4" muted></video>`);
    if (path.startsWith('/report.txt')) return send('text/plain', 'quarterly numbers', { 'content-disposition': 'attachment; filename="report.txt"' });
    if (path.startsWith('/setup.exe')) return send('application/octet-stream', 'MZ', { 'content-disposition': 'attachment; filename="setup.exe"' });
    if (path.startsWith('/pic.webp')) return send('image/webp', WEBP);
    if (path.startsWith('/clip.mp4')) return send('video/mp4', BIG);
    if (path.startsWith('/hls/master.m3u8')) return send('application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720\nhd/index.m3u8\n');
    if (/^\/hls\/(hd|low)\/index\.m3u8/.test(path)) return send('application/vnd.apple.mpegurl', `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${SEGMENTS.map((_, i) => `#EXTINF:4.0,\nseg${i}.ts`).join('\n')}\n#EXT-X-ENDLIST\n`);
    if (path.startsWith('/hls/drm.m3u8')) return send('application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://k",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:4,\nseg0.ts\n#EXT-X-ENDLIST\n');
    const seg = /^\/hls\/hd\/seg(\d)\.ts/.exec(path);
    if (seg) return send('video/mp2t', SEGMENTS[Number(seg[1])]);
    send('text/html', `<!doctype html><title>Plain ${path}</title><h1 id="h">Plain</h1>`);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as { port: number }).port;
});

// One app for the whole file, kept in the background: no windows opening and closing while you work.
let app: ElectronApplication;
let win: Page;
let userData = '';
const dir = mkdtempSync(join(tmpdir(), 'kite-dl-'));
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ app, win, userData } = await launch(undefined, [], { KITE_DOWNLOADS: dir, KITE_TEST_QUIET: '1' }));
});
test.afterAll(async () => {
  await app?.close();
  server.close();
});
// Every test starts in the first Space with no panel open.
test.beforeEach(async () => {
  if (await win.getByTestId('site-info').count()) await win.keyboard.press('Escape');
  if (await win.getByTestId('sheet-close').count()) await win.getByTestId('sheet-close').click();
  await win.keyboard.press('Control+1');
});

async function open(win: Page, address: string) {
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill(address);
  await win.getByTestId('cb-input').press('Enter');
}

/** Run code in the page of the tab that is showing. */
async function inPage<T = unknown>(win: Page, code: string): Promise<T> {
  return win.evaluate((js) => {
    const wv = [...document.querySelectorAll('webview')].find((w) => (w as HTMLElement).dataset.visible === 'true') as unknown as { executeJavaScript(c: string): Promise<unknown> };
    return wv.executeJavaScript(js);
  }, code) as Promise<T>;
}

const row = (win: Page, title: string) => win.locator(`[data-testid^="row-"][data-title="${title}"]`);

/** Call something on the main process's test hooks with the visible page's webContents. */
function main<T>(app: ElectronApplication, fn: string, arg?: unknown): Promise<T> {
  return app.evaluate(
    async ({ webContents }, [body, a]) => {
      const t = (globalThis as any).__kiteTest;
      const pages = webContents.getAllWebContents().filter((w) => w.getType() === 'webview');
      return new Function('t', 'pages', 'arg', `return (async () => { ${body} })()`)(t, pages, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;
}

test('Shields: ads and trackers are blocked, leftovers hidden, and a site exception turns it off', async () => {
  await open(win, url('/ads'));
  await expect(row(win, 'Ads Page')).toHaveCount(1, { timeout: 15000 });
  // The page's own script ran; the two third-party requests were stopped before leaving the computer.
  await expect.poll(() => inPage(win, 'document.documentElement.dataset.own')).toBe('1');
  await expect(win.getByTestId('url-blocked')).toContainText('2', { timeout: 10000 });
  // The empty ad box is hidden; the story is not.
  await expect.poll(() => inPage(win, `getComputedStyle(document.getElementById('slot')).display`)).toBe('none');
  expect(await inPage(win, `getComputedStyle(document.getElementById('story')).display`)).toBe('block');

  // The address bar popover reports it and can switch Shields off for this site.
  await win.getByTestId('url-security').click();
  await expect(win.getByTestId('site-info-title')).toHaveText('On this computer or network');
  await expect(win.getByTestId('site-info-blocked')).toContainText('2 ads and trackers blocked');
  await win.getByTestId('site-info-shields').click();
  await expect(win.getByTestId('toast').last()).toContainText('Shields are off for this site');
  await expect(win.getByTestId('url-blocked')).toHaveCount(0);
  await expect.poll(() => inPage(win, `getComputedStyle(document.getElementById('slot')).display`), { timeout: 10000 }).toBe('block');
  expect(await main<number>(app, 'return t.network().count(pages[0].id)')).toBe(0);
});

test('downloads: a file is saved with progress in the list; a program asks first and is not kept when refused', async () => {
  await app.evaluate(({ dialog }) => {
    (globalThis as any).warned = [];
    dialog.showMessageBoxSync = ((...args: any[]) => {
      (globalThis as any).warned.push((args.length > 1 ? args[1] : args[0]).message);
      return 0;
    }) as any;
  });
  await open(win, url('/files'));
  await expect(row(win, 'Files')).toHaveCount(1, { timeout: 15000 });
  await inPage(win, `document.getElementById('doc').click()`);
  await expect.poll(() => existsSync(join(dir, 'report.txt')), { timeout: 15000 }).toBe(true);
  expect(readFileSync(join(dir, 'report.txt'), 'utf8')).toBe('quarterly numbers');
  await expect(win.getByTestId('toast').last()).toContainText('Downloaded “report.txt”');

  // A second copy never overwrites the first.
  await inPage(win, `document.getElementById('doc').click()`);
  await expect.poll(() => existsSync(join(dir, 'report (2).txt')), { timeout: 15000 }).toBe(true);

  // A program: Kite warns, and "Don't Download" keeps it off the disk.
  await inPage(win, `document.getElementById('app').click()`);
  await expect.poll(() => app.evaluate(() => (globalThis as any).warned.length), { timeout: 10000 }).toBe(1);
  expect(await app.evaluate(() => (globalThis as any).warned[0])).toContain('setup.exe');
  await win.waitForTimeout(500);
  expect(readdirSync(dir).some((f) => f.includes('setup'))).toBe(false);

  // The Downloads panel lists both files, and finds the video on the page.
  await win.getByTestId('btn-downloads').click();
  await expect(win.locator('[data-testid^="download-dl-"]')).toHaveCount(2);
  await expect(win.getByTestId('download-status').first()).toContainText('127.0.0.1');
  await expect(win.getByTestId('media-item')).toHaveCount(1);
  await win.getByTestId('media-download').click();
  await expect.poll(() => existsSync(join(dir, 'clip.mp4')), { timeout: 15000 }).toBe(true);
  await expect.poll(() => readFileSync(join(dir, 'clip.mp4')).length, { timeout: 15000 }).toBe(BIG.length);
  await win.getByTestId('downloads-clear').click();
  await expect(win.getByTestId('downloads-empty')).toBeVisible();
  expect(existsSync(join(dir, 'report.txt'))).toBe(true); // clearing the list keeps the files
});

test('downloads: an image can be saved converted, and an HLS video is joined from its pieces in the chosen quality', async () => {
  await open(win, url('/files'));
  await expect(row(win, 'Files')).toHaveCount(1, { timeout: 15000 });

  await main(app, `await t.downloads().saveImage(pages[0], arg, 'jpeg')`, url('/pic.webp'));
  const jpg = readFileSync(join(dir, 'pic.jpg'));
  expect([jpg[0], jpg[1], jpg[2]]).toEqual([0xff, 0xd8, 0xff]); // a real JPEG
  await main(app, `await t.downloads().saveImage(pages[0], arg, 'png')`, url('/pic.webp'));
  expect(readFileSync(join(dir, 'pic.png')).subarray(1, 4).toString()).toBe('PNG');
  // Saving it unchanged keeps the original bytes.
  await main(app, `t.downloads().saveImage(pages[0], arg, 'original')`, url('/pic.webp'));
  await expect.poll(() => existsSync(join(dir, 'pic.webp')) && readFileSync(join(dir, 'pic.webp')).equals(WEBP), { timeout: 15000 }).toBe(true);

  const variants = await main<{ label: string; url: string }[]>(app, `return t.downloads().hlsVariants(pages[0].session, arg, pages[0].getURL())`, url('/hls/master.m3u8'));
  expect(variants.map((v) => v.label)).toEqual(['720p', '360p']);
  await main(app, `await t.downloads().downloadHls(pages[0], arg, 'My Show')`, variants[0].url);
  expect(readFileSync(join(dir, 'My Show.ts')).equals(Buffer.concat(SEGMENTS))).toBe(true);
  // Given the master playlist, the best quality is picked.
  requests.length = 0;
  await main(app, `await t.downloads().downloadHls(pages[0], arg, 'Auto')`, url('/hls/master.m3u8'));
  expect(readFileSync(join(dir, 'Auto.ts')).length).toBe(6000);
  expect(requests.some((r) => r.startsWith('/hls/low/'))).toBe(false);

  // Copy-protected video is refused, with the reason, and leaves no file.
  await main(app, `await t.downloads().downloadHls(pages[0], arg, 'Locked')`, url('/hls/drm.m3u8'));
  const list = await main<{ name: string; state: string; error?: string }[]>(app, 'return t.downloads().list()');
  const locked = list.find((d) => d.name.startsWith('Locked'))!;
  expect(locked.state).toBe('failed');
  expect(locked.error).toContain('copy-protected');
  expect(readdirSync(dir).some((f) => f.startsWith('Locked'))).toBe(false);
  expect(list.filter((d) => d.state === 'completed')).toHaveLength(5);
});

test('Spaces: a Space with separate logins has its own cookies; other Spaces share', async () => {
  await open(win, url('/cookie?set'));
  await expect(row(win, 'cookie:who=first')).toHaveCount(1, { timeout: 15000 });

  // A second, ordinary Space sees the same login.
  await win.getByTestId('btn-new-space').click();
  await win.getByTestId('space-name-input').fill('Shared');
  await win.getByTestId('space-done').click();
  await open(win, url('/cookie'));
  await expect(row(win, 'cookie:who=first')).toHaveCount(1, { timeout: 15000 });

  // Turn on separate logins: its tab reloads with an empty cookie jar.
  await win.getByTestId('space-name').dblclick();
  await win.getByTestId('space-isolated').click();
  await win.getByTestId('space-done').click();
  await expect(win.getByTestId('space-isolated-badge')).toBeVisible();
  await expect(row(win, 'cookie:none')).toHaveCount(1, { timeout: 15000 });
  expect(await main<string[]>(app, 'return t.jars()')).toHaveLength(2);
  // What it saves stays inside it…
  await inPage(win, `document.cookie = 'who=second; path=/; max-age=3600'`);
  // …and the first Space still has its own login.
  await win.keyboard.press('Control+1');
  await expect(row(win, 'cookie:who=first')).toHaveCount(1);
  expect(await inPage(win, 'document.cookie')).toBe('who=first');
  // Both jars are saved on disk separately.
  await expect.poll(() => readdirSync(join(userData, 'Partitions')).filter((n) => /^kite/i.test(n)).length, { timeout: 10000 }).toBe(2);
});

test('extensions: install from a folder and a zip, run on pages in every Space, turn off, remove', async () => {
  const src = mkdtempSync(join(tmpdir(), 'kite-ext-'));
  const manifest = { manifest_version: 3, name: 'Marker', version: '1.0.0', description: 'Marks pages', permissions: ['storage', 'contextMenus'], action: { default_popup: 'popup.html' }, content_scripts: [{ matches: ['<all_urls>'], js: ['mark.js'], run_at: 'document_end' }] };
  writeFileSync(join(src, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(src, 'mark.js'), `document.documentElement.dataset.marker = 'on';`);
  writeFileSync(join(src, 'popup.html'), '<!doctype html><title>Marker popup</title>hi');
  mkdirSync(join(src, 'node_modules'));
  writeFileSync(join(src, 'node_modules', 'junk.js'), 'x');

  const preview = await main<{ token: string; name: string; access: string[]; limits: string[] }>(app, 'return t.extensions().previewFolder(arg)', src);
  expect(preview.name).toBe('Marker');
  expect(preview.access[0]).toContain('every website');
  expect(preview.limits.join(' ')).toContain('toolbar button');
  // Nothing is installed until you say yes.
  expect(await main<unknown[]>(app, 'return t.extensions().list()')).toHaveLength(0);
  await main(app, 'await t.extensions().confirm(arg)', preview.token);
  const [ext] = await main<{ id: string; enabled: boolean; error?: string }[]>(app, 'return t.extensions().list()');
  expect(ext.enabled).toBe(true);
  expect(ext.error).toBeUndefined();
  expect(existsSync(join(userData, 'extensions', ext.id, 'mark.js'))).toBe(true);
  expect(existsSync(join(userData, 'extensions', ext.id, 'node_modules'))).toBe(false);

  await open(win, url('/ext'));
  await expect(row(win, 'Plain /ext')).toHaveCount(1, { timeout: 15000 });
  await expect.poll(() => inPage(win, 'document.documentElement.dataset.marker'), { timeout: 10000 }).toBe('on');
  // The page itself can't reach extension APIs.
  expect(await inPage(win, 'typeof chrome === "undefined" || typeof chrome.storage === "undefined"')).toBe(true);

  // The panel lists it, with its limits; its popup opens in its own window.
  await win.keyboard.press(`${MOD}+t`);
  await win.getByTestId('cb-input').fill('Extensions');
  await win.getByTestId('cb-result-action').first().click();
  await expect(win.getByTestId(`ext-${ext.id}`)).toContainText('Marker');
  const popup = app.waitForEvent('window');
  await win.getByTestId('ext-popup').click();
  const popupWin = await popup;
  await expect.poll(() => popupWin.title()).toBe('Marker popup');
  await popupWin.close();

  // It also runs in a Space with separate logins.
  await win.getByTestId('sheet-close').click();
  await win.getByTestId('btn-new-space').click();
  await win.getByTestId('space-isolated').click();
  await win.getByTestId('space-done').click();
  await open(win, url('/ext2'));
  await expect.poll(() => inPage(win, 'document.documentElement.dataset.marker').catch(() => ''), { timeout: 15000 }).toBe('on');

  // Off: pages are left alone after a reload.
  await main(app, 'await t.extensions().setEnabled(arg, false)', ext.id);
  await win.keyboard.press(`${MOD}+r`);
  await win.waitForTimeout(1500);
  expect(await inPage(win, 'document.documentElement.dataset.marker || "none"')).toBe('none');

  // Remove: its files go too.
  await main(app, 'await t.extensions().remove(arg)', ext.id);
  expect(existsSync(join(userData, 'extensions', ext.id))).toBe(false);

  // A packed file works the same way; a broken one is refused with a reason.
  const zip = join(src, 'packed.zip');
  writeFileSync(zip, zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'mark.js': strToU8('1'), '../escape.js': strToU8('bad') }));
  const p2 = await main<{ token: string; name: string }>(app, 'return t.extensions().previewFile(arg)', zip);
  expect(p2.name).toBe('Marker');
  await main(app, 't.extensions().cancel(arg)', p2.token);
  expect(existsSync(join(userData, 'extensions', 'escape.js'))).toBe(false);
  expect(existsSync(join(userData, 'escape.js'))).toBe(false);
  const bad = join(src, 'bad.zip');
  writeFileSync(bad, zipSync({ 'readme.txt': strToU8('no manifest') }));
  expect(await main<string>(app, 'try { t.extensions().previewFile(arg); return "ok" } catch (e) { return e.message }', bad)).toContain('manifest.json');
});

test('permissions: “Always Allow” is remembered on disk, listed in Settings, and can be forgotten', async () => {
  const stub = (response: number) =>
    app.evaluate(({ dialog }, r) => {
      (globalThis as any).asked = 0;
      dialog.showMessageBox = (async () => {
        (globalThis as any).asked++;
        return { response: r, checkboxChecked: false };
      }) as any;
    }, response);
  await stub(2);
  await open(win, url('/perm'));
  await expect(row(win, 'Plain /perm')).toHaveCount(1, { timeout: 15000 });
  const ask = `Notification.requestPermission()`;
  expect(await inPage(win, ask)).toBe('granted');
  expect(await main<{ site: string; permission: string; allowed: boolean }[]>(app, 'return t.permissions().list()')).toEqual([expect.objectContaining({ site: '127.0.0.1', permission: 'notifications', allowed: true })]);
  expect(JSON.parse(readFileSync(join(userData, 'permissions.json'), 'utf8'))).toEqual({ '127.0.0.1|notifications': true });
  // Asked once; the answer is reused.
  expect(await inPage(win, ask)).toBe('granted');
  expect(await app.evaluate(() => (globalThis as any).asked)).toBe(1);

  // Settings lists it; forgetting makes the site ask again (and now the answer is no).
  await stub(0);
  await win.keyboard.press(`${MOD}+,`);
  await win.getByTestId('settings-privacy').click();
  await expect(win.getByTestId('perm-list')).toContainText('127.0.0.1');
  await win.getByTestId('perm-forget-all').click();
  await expect(win.getByTestId('perm-list')).toContainText('Nothing remembered');
  await win.getByTestId('sheet-close').click();
  expect(await inPage(win, ask)).toBe('denied');
  expect(await app.evaluate(() => (globalThis as any).asked)).toBe(1);
  expect(JSON.parse(readFileSync(join(userData, 'permissions.json'), 'utf8'))).toEqual({});
});

test('a page that can’t load says why, and “Try again” works', async () => {
  await open(win, 'http://127.0.0.1:9/');
  await expect(win.getByTestId('load-error')).toBeVisible({ timeout: 15000 });
  await expect(win.getByTestId('load-error')).toContainText(/refused to connect|is blocked/);
  await expect(win.getByTestId('load-error-http')).toHaveCount(0); // already http, local
  await open(win, url('/after'));
  await expect(row(win, 'Plain /after')).toHaveCount(1, { timeout: 15000 });
  await expect(win.getByTestId('load-error')).toHaveCount(0);
});

test('privacy: Global Privacy Control reaches sites, and erasing a site’s data signs it out', async () => {
  await open(win, url('/priv'));
  await expect(row(win, 'Plain /priv')).toHaveCount(1, { timeout: 15000 });
  expect(gpc).toBe('1/1'); // the site received Sec-GPC and DNT
  await inPage(win, `document.cookie = 'login=yes; path=/; max-age=3600'; localStorage.setItem('k', 'v')`);
  expect(await inPage(win, 'document.cookie')).toContain('login=yes');
  await win.getByTestId('url-security').click();
  await win.getByTestId('site-info-clear').click();
  await expect(win.getByTestId('toast').last()).toContainText('erased');
  await expect.poll(() => inPage(win, 'document.cookie + "|" + localStorage.length').catch(() => 'x'), { timeout: 10000 }).toBe('|0');
});

test('layout: hiding the sidebar leaves no empty band above the page, and the window buttons hide with it', async () => {
  test.skip(process.platform !== 'darwin', 'window buttons in the sidebar are a macOS thing');
  await open(win, url('/layout'));
  await expect(row(win, 'Plain /layout')).toHaveCount(1, { timeout: 15000 });
  const buttons = () => main<{ visible: boolean; x: number; y: number }>(app, 'return t.windowButtons[t.windowButtons.length - 1]');
  expect(await buttons()).toEqual({ visible: true, x: 16, y: 16 });
  await win.keyboard.press(`${MOD}+s`);
  await expect.poll(async () => (await win.getByTestId('page-card').boundingBox())!.x).toBe(8);
  const card = (await win.getByTestId('page-card').boundingBox())!;
  const size = await win.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect([card.y, size.w - card.x - card.width, size.h - card.y - card.height]).toEqual([8, 8, 8]);
  expect(await buttons()).toMatchObject({ visible: false });
  // The real web page fills that card.
  const wv = (await win.locator('.surface-slot[data-visible] webview').boundingBox())!;
  expect([Math.round(wv.y), Math.round(wv.height)]).toEqual([8, Math.round(card.height)]);
  await win.keyboard.press(`${MOD}+s`);
  await expect.poll(buttons).toEqual({ visible: true, x: 16, y: 16 });
});

// Kite's Electron main process: windows, saving, and keeping web pages in check.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
  webContents as allWebContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Storage } from './storage';
import { findAction, toAccelerator } from '../shared/shortcuts';
import { hostOf } from '../shared/url';
import type { OpenRequest } from '../shared/ipc';
import { floatPipWindowsSoon, installVideoPanelHooks } from './macWindows';
import { MEDIA_PLAYING_SCRIPT, PIP_ENTER_SCRIPT, PIP_EXIT_SCRIPT, pipPopped } from '../shared/pip';

const isMac = process.platform === 'darwin';
const devUrl = process.env.KITE_DEV_URL;
const userDataOverride = process.env.KITE_USER_DATA;
if (userDataOverride) app.setPath('userData', userDataOverride);

const PARTITION = 'persist:kite';
const isWebUrl = (u: string) => /^https?:\/\//i.test(u);

let storage: Storage;
let mainWindow: BrowserWindow | null = null;
const littleWindows = new Set<BrowserWindow>();
/** webContents id of a web page → the tab it belongs to + the window hosting it. */
const pages = new Map<number, { tabId: string; host: WebContents }>();
let shortcuts: Record<string, string> = {};
let littleHotkey = '';
const pendingExternal: string[] = [];

function rendererUrl(query = ''): string {
  if (devUrl) return `${devUrl}${query}`;
  return `file://${join(__dirname, '../renderer/index.html')}${query}`;
}

/** Only Kite's own UI may use Kite's private messages — never a web page. */
function fromKite(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  if (devUrl) return url.startsWith(devUrl);
  return url.startsWith(`file://${join(__dirname, '../renderer/index.html')}`);
}

function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: true,
    spellcheck: true,
  };
}

/** Kite's own windows must never be navigated away from Kite (e.g. by dropping a link on them). */
function lockKiteWindow(win: BrowserWindow) {
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 720,
    minHeight: 480,
    title: 'Kite',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171c' : '#f3efe9',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: !isMac,
    webPreferences: baseWebPreferences(),
  });
  lockKiteWindow(win);
  win.once('ready-to-show', () => win.show());
  win.loadURL(rendererUrl());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.on('did-finish-load', () => {
    while (pendingExternal.length) win.webContents.send('external-url', pendingExternal.shift());
  });
  // Switching to another app pops the playing video out (see autoPipOnLeave).
  // On macOS the app-level "resign active" event is used instead: it fires
  // first, before macOS marks Kite's covered window as hidden.
  win.on('blur', () => {
    if (!isMac) void autoPipOnLeave('window blur');
  });
  win.on('focus', () => void autoPipReturn('window focus'));
  return win;
}

function isKiteWindow(w: BrowserWindow) {
  return w === mainWindow || littleWindows.has(w);
}

// ---- Picture-in-picture -------------------------------------------------------

/** When running from source, every pop-out attempt is written to kite-debug.log. */
function debugLog(msg: string) {
  if (app.isPackaged && !process.env.KITE_DEBUG_LOG) return;
  try {
    appendFileSync(process.env.KITE_DEBUG_LOG || join(app.getAppPath(), 'kite-debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* read-only location */
  }
}

/** Tab ids the main window wants popped out on an app switch, best first. */
let pipTargets: string[] = [];
let pipTargetsHost: WebContents | null = null;
/** The page whose video we popped out because you left Kite. */
let pipLeft: { wcId: number; tabId: string; host: WebContents } | null = null;

function pageForTab(tabId: string, host: WebContents) {
  let found: number | null = null;
  for (const [wcId, p] of pages) {
    if (p.tabId !== tabId || p.host !== host) continue;
    const wc = allWebContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) pages.delete(wcId); // page was replaced
    else found = wcId;
  }
  return found;
}

/** Try to pop out a video in a page and each frame inside it. Returns a status for the log. */
async function enterPip(wcId: number): Promise<string> {
  const wc = allWebContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return 'no page';
  const statuses: string[] = [];
  for (const frame of wc.mainFrame.framesInSubtree) {
    try {
      // `true` = run as if you clicked: browsers only allow pop-out after a user action.
      const st = await frame.executeJavaScript(PIP_ENTER_SCRIPT, true);
      if (pipPopped(st)) {
        // macOS: keep the video on top of every app and desktop, even full-screen ones.
        floatPipWindowsSoon(debugLog, 'popped out');
        return String(st);
      }
      statuses.push(String(st));
    } catch (err) {
      statuses.push(`frame error ${(err as Error).message}`);
    }
  }
  return statuses.join(' | ') || 'no frames';
}

async function exitPip(wcId: number) {
  const wc = allWebContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return;
  for (const frame of wc.mainFrame.framesInSubtree) {
    try {
      await frame.executeJavaScript(PIP_EXIT_SCRIPT, true);
    } catch {
      /* frame went away */
    }
  }
}

/** You switched to another app: pop the visible playing video out right away. */
let leaving = false;
async function autoPipOnLeave(why: string) {
  const host = pipTargetsHost;
  if (!host || host.isDestroyed() || !pipTargets.length || pipLeft || leaving) {
    debugLog(`leave (${why}): nothing to do [targets=${pipTargets.length}, already=${!!pipLeft || leaving}]`);
    return;
  }
  leaving = true;
  try {
    await leaveNow(host, why);
  } finally {
    leaving = false;
  }
}

async function leaveNow(host: WebContents, why: string) {
  const t0 = Date.now();
  for (const tabId of pipTargets) {
    const wcId = pageForTab(tabId, host);
    if (wcId === null) continue;
    const status = await enterPip(wcId);
    debugLog(`leave (${why}): tab ${tabId} → ${status} (${Date.now() - t0}ms)`);
    if (pipPopped(status)) {
      // Switched to a little window or a Kite dialog after all? Then it wasn't an app switch.
      const f = BrowserWindow.getFocusedWindow();
      if (!isMac && f && isKiteWindow(f) && f !== mainWindow) {
        await exitPip(wcId);
        debugLog('leave: focus went to another Kite window, video returned');
        return;
      }
      pipLeft = { wcId, tabId, host };
      if (!host.isDestroyed()) host.send('pip-state', { tabId, popped: true });
      return;
    }
  }
}

/** Kite's main window is in front again: put the video back in its page. */
async function autoPipReturn(why: string) {
  const left = pipLeft;
  if (!left) return;
  pipLeft = null;
  await exitPip(left.wcId);
  debugLog(`return (${why}): tab ${left.tabId}`);
  if (!left.host.isDestroyed()) left.host.send('pip-state', { tabId: left.tabId, popped: false });
}

// A page could try to open endless windows; allow a few per few seconds.
let littleTimes: number[] = [];
function createLittleWindow(url: string): BrowserWindow | null {
  const now = Date.now();
  littleTimes = littleTimes.filter((t) => now - t < 5000);
  if (littleTimes.length >= 4) return null;
  littleTimes.push(now);
  if (url !== 'kite://new' && !isWebUrl(url)) return null;
  const win = new BrowserWindow({
    width: 560,
    height: 700,
    minWidth: 360,
    minHeight: 320,
    title: 'Kite',
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 13 },
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171c' : '#f3efe9',
    webPreferences: baseWebPreferences(),
  });
  lockKiteWindow(win);
  littleWindows.add(win);
  win.once('ready-to-show', () => win.show());
  win.loadURL(rendererUrl(`?mode=little&url=${encodeURIComponent(url)}`));
  win.on('closed', () => littleWindows.delete(win));
  return win;
}

function ensureMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  return mainWindow;
}

/** Deliver a message to the main window, waiting for it to load if needed. */
function sendToMain(channel: string, payload: unknown) {
  const win = ensureMainWindow();
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(channel, payload));
  else win.webContents.send(channel, payload);
}

function sendOpen(host: WebContents, req: OpenRequest) {
  // Pages may only ask Kite to open web links (never file:, data:, kite: …).
  if (!isWebUrl(req.url) || host.isDestroyed()) return;
  host.send('open-request', req);
}

/** Links to other apps (mailto:, zoommtg: …): safe ones open, anything else asks first. */
const SAFE_SCHEMES = /^(mailto|tel|sms|facetime|facetime-audio|webcal|maps|zoommtg|zoomus|msteams|slack|spotify|tg|whatsapp):/i;
async function openOutside(url: string, from: WebContents) {
  if (SAFE_SCHEMES.test(url)) return void shell.openExternal(url).catch(() => undefined);
  const scheme = url.split(':')[0];
  const win = BrowserWindow.fromWebContents(from) ?? mainWindow ?? undefined;
  const opts = {
    type: 'question' as const,
    buttons: ['Cancel', 'Open'],
    defaultId: 0,
    cancelId: 0,
    message: `Open “${scheme}:” link in another app?`,
    detail: `A page wants to open:\n${url.slice(0, 300)}\n\nOnly continue if you trust it.`,
  };
  const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  if (res.response === 1) shell.openExternal(url).catch(() => undefined);
}

let popupTimes: number[] = [];

/** Rules shared by web pages and the popups they open. */
function guardNavigation(contents: WebContents) {
  contents.on('will-navigate', (e, url) => {
    if (/^(https?|about|blob):/i.test(url)) return;
    if (/^file:/i.test(url) && /^file:/i.test(contents.getURL())) return; // a local file linking to another
    e.preventDefault();
    if (!/^(file|data|javascript|kite|chrome|devtools):/i.test(url)) void openOutside(url, contents);
  });
}

/** Lock down every web page shown inside a <webview>. */
function hardenWebview(contents: WebContents) {
  guardNavigation(contents);
  contents.setWindowOpenHandler((details) => {
    const page = pages.get(contents.id);
    const host = page?.host ?? mainWindow?.webContents;
    if (!isWebUrl(details.url) && details.url !== 'about:blank') return { action: 'deny' };
    // Real popups (sign-in windows etc.) need to stay popups — a few at a time.
    if (details.disposition === 'new-window' && details.features) {
      const now = Date.now();
      popupTimes = popupTimes.filter((t) => now - t < 5000);
      if (popupTimes.length >= 3) return { action: 'deny' };
      popupTimes.push(now);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: PARTITION } },
      };
    }
    if (host) {
      const disposition = details.disposition === 'background-tab' ? 'background-tab' : 'new-tab';
      sendOpen(host, { url: details.url, disposition, sourceTabId: page?.tabId ?? null });
    }
    return { action: 'deny' };
  });
  // Popups get the same rules, and can't open more popups themselves.
  contents.on('did-create-window', (popup) => {
    guardNavigation(popup.webContents);
    popup.webContents.setWindowOpenHandler((d) => {
      const host = pages.get(contents.id)?.host ?? mainWindow?.webContents;
      if (host) sendOpen(host, { url: d.url, disposition: 'new-tab', sourceTabId: null });
      return { action: 'deny' };
    });
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const page = pages.get(contents.id);
    if (input.key === 'Escape' && page?.tabId.startsWith('peek:') && !input.meta && !input.control && !input.alt) {
      event.preventDefault();
      page.host.send('shortcut', 'closePeek');
      return;
    }
    if (!input.meta && !input.control && !input.alt) return;
    const action = findAction(
      { key: input.key, code: input.code, metaKey: input.meta, ctrlKey: input.control, altKey: input.alt, shiftKey: input.shift },
      shortcuts,
      isMac,
    );
    const host = pages.get(contents.id)?.host;
    if (action && host && !host.isDestroyed()) {
      // Let pages keep their own copy/paste/find etc. — only forward Kite actions.
      if (action === 'findInPage') return;
      event.preventDefault();
      host.send('shortcut', action);
    }
  });

  contents.on('context-menu', (_e, params) => {
    const page = pages.get(contents.id);
    const host = page?.host;
    if (!host) return;
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.linkURL && isWebUrl(params.linkURL)) {
      const url = params.linkURL;
      items.push(
        { label: 'Open Link in New Tab', click: () => sendOpen(host, { url, disposition: 'new-tab', sourceTabId: page.tabId }) },
        { label: 'Open Link in Background', click: () => sendOpen(host, { url, disposition: 'background-tab', sourceTabId: page.tabId }) },
        { label: 'Open Link in Peek', click: () => sendOpen(host, { url, disposition: 'peek', sourceTabId: page.tabId }) },
        { label: 'Open Link in Split View', click: () => host.send('open-split', { url, sourceTabId: page.tabId }) },
        { label: 'Open Link in Little Window', click: () => createLittleWindow(url) },
        { type: 'separator' },
        { label: 'Copy Link', click: () => clipboard.writeText(url) },
        { type: 'separator' },
      );
    }
    if (params.selectionText) items.push({ role: 'copy' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    if (params.mediaType === 'image' && isWebUrl(params.srcURL)) {
      items.push({ label: 'Open Image in New Tab', click: () => sendOpen(host, { url: params.srcURL, disposition: 'new-tab', sourceTabId: page.tabId }) });
      items.push({ label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) });
    }
    if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' });
    items.push(
      { label: 'Back', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() },
      { label: 'Reload', click: () => contents.reload() },
      { label: 'Boost This Site…', click: () => host.send('shortcut', 'boostEditor') },
      { type: 'separator' },
      { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) },
    );
    Menu.buildFromTemplate(items).popup();
  });
}

/**
 * Websites must ask before using the camera, microphone, location, notifications…
 * Answers are remembered until Kite quits.
 */
const decisions = new Map<string, boolean>();
const ALWAYS_OK = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management']);
const LABELS: Record<string, string> = {
  media: 'use your camera or microphone',
  geolocation: 'know your location',
  notifications: 'show notifications',
  'clipboard-read': 'read your clipboard',
  midi: 'use MIDI devices',
  midiSysex: 'use MIDI devices',
  'display-capture': 'record your screen',
  idleDetection: 'know when you’re idle',
  hid: 'use connected devices',
  serial: 'use serial devices',
  usb: 'use USB devices',
  'storage-access': 'use its saved data on other sites',
  'top-level-storage-access': 'use its saved data on other sites',
};
function setupPermissions() {
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (ALWAYS_OK.has(permission)) return callback(true);
    if (permission === 'openExternal') return callback(false); // handled by openOutside()
    const label = LABELS[permission];
    const site = hostOf(details.requestingUrl || wc.getURL()) || 'This page';
    if (!label) return callback(false);
    const key = `${site}|${permission}`;
    if (decisions.has(key)) return callback(decisions.get(key)!);
    const win = BrowserWindow.fromWebContents(pages.get(wc.id)?.host ?? wc) ?? mainWindow ?? undefined;
    const opts = { type: 'question' as const, buttons: ['Don’t Allow', 'Allow'], defaultId: 0, cancelId: 0, message: `Allow ${site} to ${label}?`, detail: 'You’ll be asked again after Kite restarts.' };
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    const ok = res.response === 1;
    decisions.set(key, ok);
    callback(ok);
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => {
    if (ALWAYS_OK.has(permission)) return true;
    return decisions.get(`${hostOf(origin) || hostOf(wc?.getURL() ?? '')}|${permission}`) ?? false;
  });
}

function registerGlobalHotkey() {
  globalShortcut.unregisterAll();
  const acc = littleHotkey ? toAccelerator(littleHotkey) : null;
  if (!acc) return;
  try {
    globalShortcut.register(acc, () => createLittleWindow('kite://new'));
  } catch {
    /* hotkey taken by another app */
  }
}

function handleExternalUrl(url: string) {
  if (!isWebUrl(url)) return;
  const win = mainWindow;
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('external-url', url);
  else {
    pendingExternal.push(url);
    ensureMainWindow();
  }
}

function arcDefaultPath(): string {
  return join(homedir(), 'Library', 'Application Support', 'Arc', 'StorableSidebar.json');
}

function setupIpc() {
  // Every handler checks the sender is Kite's own UI.
  const on = (ch: string, fn: (e: IpcMainEvent, ...a: never[]) => void) => ipcMain.on(ch, (e, ...a) => fromKite(e) && fn(e, ...(a as never[])));
  const handle = (ch: string, fn: (e: IpcMainInvokeEvent, ...a: never[]) => unknown) =>
    ipcMain.handle(ch, (e, ...a) => {
      if (!fromKite(e)) throw new Error('Not allowed');
      return fn(e, ...(a as never[]));
    });

  handle('state:load', () => storage.load());
  handle('state:save', (_e, json: string) => storage.save(json));
  // Used on quit, when there's no time to wait for an async reply.
  ipcMain.on('state:save-sync', (e, json: string) => {
    if (!fromKite(e)) return void (e.returnValue = false);
    try {
      storage.save(json);
      e.returnValue = true;
    } catch {
      e.returnValue = false;
    }
  });
  on('page:register', (e, id: number, tabId: string) => pages.set(id, { tabId, host: e.sender }));
  on('page:unregister', (_e, id: number) => pages.delete(id));
  // Run Kite's helper scripts in a separate "world" the page itself can't see or tamper with.
  handle('page:exec-isolated', async (e, id: number, code: string) => {
    const page = pages.get(id);
    if (!page || page.host !== e.sender) throw new Error('Unknown page');
    const wc = allWebContents.fromId(id);
    return wc ? wc.executeJavaScriptInIsolatedWorld(1999, [{ code }]) : null;
  });
  // Picture-in-picture by hand (⌘⇧P) and on tab switches.
  handle('pip:enter', async (e, id: number) => {
    const page = pages.get(id);
    if (!page || page.host !== e.sender) return false;
    const status = await enterPip(id);
    debugLog(`enter (switch or ⌘⇧P): tab ${page.tabId} → ${status}`);
    return pipPopped(status);
  });
  handle('pip:exit', async (e, id: number) => {
    const page = pages.get(id);
    if (!page || page.host !== e.sender) return;
    if (pipLeft?.wcId === id) pipLeft = null;
    await exitPip(id);
  });
  // A page said "media paused" — but one paused video (a preview, an ad) doesn't mean
  // nothing plays any more. Check every frame.
  handle('page:media-playing', async (e, id: number) => {
    const page = pages.get(id);
    const wc = allWebContents.fromId(id);
    if (!page || page.host !== e.sender || !wc || wc.isDestroyed()) return false;
    for (const frame of wc.mainFrame.framesInSubtree) {
      try {
        if ((await frame.executeJavaScript(MEDIA_PLAYING_SCRIPT)) === true) return true;
      } catch {
        /* frame went away */
      }
    }
    return false;
  });
  on('debug:log', (_e, msg: string) => typeof msg === 'string' && debugLog(msg.slice(0, 500)));
  // Which tabs to pop out if you switch apps — kept up to date by the main window.
  on('pip:targets', (e, tabIds: string[]) => {
    if (!mainWindow || e.sender !== mainWindow.webContents || !Array.isArray(tabIds)) return;
    pipTargets = tabIds.filter((t) => typeof t === 'string').slice(0, 4);
    pipTargetsHost = e.sender;
  });
  on('shortcuts:set', (_e, map: Record<string, string>, hotkey: string) => {
    shortcuts = map;
    if (hotkey !== littleHotkey) {
      littleHotkey = hotkey;
      registerGlobalHotkey();
    }
  });
  on('little:open', (_e, url: string) => void createLittleWindow(url));
  on('little:to-main', (e, url: string, spaceId: string | null) => {
    if (!isWebUrl(url)) return;
    sendToMain('little-to-main', { url, spaceId });
    const win = ensureMainWindow();
    win.show();
    win.focus();
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  on('little:archive', (_e, url: string, title: string) => {
    if (isWebUrl(url)) sendToMain('little-archived', { url, title: String(title).slice(0, 300) });
  });
  handle('arc:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose StorableSidebar.json',
      defaultPath: existsSync(arcDefaultPath()) ? arcDefaultPath() : homedir(),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return { path: res.filePaths[0], text: readFileSync(res.filePaths[0], 'utf8') };
  });
  handle('arc:read-default', () => {
    const p = arcDefaultPath();
    if (!existsSync(p)) return null;
    return { path: p, text: readFileSync(p, 'utf8') };
  });
  handle('browser:set-default', () => app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https'));
  handle('browser:is-default', () => app.isDefaultProtocolClient('https'));
  // The user picks where the file goes in a Save dialog; the name is only a suggestion.
  handle('file:export', async (e, name: string, text: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const safeName = String(name).replace(/[/\\:*?"<>|]+/g, '-').slice(0, 120) || 'kite-export.txt';
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('downloads'), safeName) });
    if (res.canceled || !res.filePath) return false;
    writeFileSync(res.filePath, String(text), 'utf8');
    return true;
  });
}

function buildAppMenu() {
  const send = (action: string) => () => {
    const w = BrowserWindow.getFocusedWindow() ?? mainWindow;
    w?.webContents.send('shortcut', action);
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab…', click: send('commandBar') },
        { label: 'New Little Window', click: () => void createLittleWindow('kite://new') },
        { label: 'New Note', click: send('newNote') },
        { type: 'separator' },
        { label: 'Import from Arc…', click: send('importArc') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', click: send('toggleSidebar') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Kite Developer Tools', accelerator: 'Alt+CommandOrControl+Shift+I', click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools() },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- app lifecycle -------------------------------------------------------

const gotLock = process.env.KITE_TEST ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => isWebUrl(a));
    if (url) handleExternalUrl(url);
    else ensureMainWindow().focus();
  });

  // macOS sends links from other apps here (when Kite is the default browser).
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (app.isReady()) handleExternalUrl(url);
    else if (isWebUrl(url)) pendingExternal.push(url);
  });

  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') hardenWebview(contents);
    contents.on('will-attach-webview', (_ev, prefs, params) => {
      // Web pages never get Node or Kite's preload, and always use Kite's own session.
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
      prefs.webSecurity = true;
      prefs.allowRunningInsecureContent = false;
      params.partition = PARTITION;
      if (!/^(https?|about|file):/i.test(params.src || 'about:blank')) params.src = 'about:blank';
    });
  });

  app.whenReady().then(() => {
    storage = new Storage(app.getPath('userData'));
    storage.snapshot(); // a dated copy per day, kept for a week
    setupPermissions();
    setupIpc();
    buildAppMenu();
    // macOS: floating videos become panels, so they show over other apps (even full-screen ones).
    if (isMac) installVideoPanelHooks(debugLog);
    const argUrl = process.argv.find((a) => isWebUrl(a));
    if (argUrl) pendingExternal.push(argUrl);
    mainWindow = createMainWindow();
    app.on('activate', () => ensureMainWindow());
    // macOS only (other systems never send these; tests send them by hand).
    app.on('did-resign-active', () => {
      // A video the site popped out by itself (its own button) gets the same treatment.
      floatPipWindowsSoon(debugLog, 'app inactive');
      void autoPipOnLeave('app inactive');
    });
    app.on('did-become-active', () => debugLog('app active again'));
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

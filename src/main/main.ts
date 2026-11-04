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
  shell,
  webContents as allWebContents,
  type WebContents,
} from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Storage } from './storage';
import { findAction, toAccelerator } from '../shared/shortcuts';
import { zapPickerScript } from '../shared/zap';
import type { OpenRequest } from '../shared/ipc';

const isMac = process.platform === 'darwin';
const devUrl = process.env.KITE_DEV_URL;
const userDataOverride = process.env.KITE_USER_DATA;
if (userDataOverride) app.setPath('userData', userDataOverride);

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

function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webviewTag: true,
    spellcheck: true,
  };
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
  win.once('ready-to-show', () => win.show());
  win.loadURL(rendererUrl());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.on('did-finish-load', () => {
    while (pendingExternal.length) win.webContents.send('external-url', pendingExternal.shift());
  });
  return win;
}

function createLittleWindow(url: string): BrowserWindow {
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

function sendOpen(host: WebContents, req: OpenRequest) {
  if (!host.isDestroyed()) host.send('open-request', req);
}

/** Lock down every web page shown inside a <webview>. */
function hardenWebview(contents: WebContents) {
  contents.setWindowOpenHandler((details) => {
    const page = pages.get(contents.id);
    const host = page?.host ?? mainWindow?.webContents;
    // Real popups (OAuth sign-in windows etc.) need to stay popups.
    if (details.disposition === 'new-window' && details.features) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } },
      };
    }
    if (host) {
      const disposition = details.disposition === 'background-tab' ? 'background-tab' : 'new-tab';
      sendOpen(host, { url: details.url, disposition, sourceTabId: page?.tabId ?? null });
    }
    return { action: 'deny' };
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
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
    if (params.linkURL) {
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
    if (params.mediaType === 'image' && params.srcURL) {
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

  // Never let a page navigate itself to something dangerous.
  contents.on('will-navigate', (e, url) => {
    if (!/^(https?|about|data|blob|file):/i.test(url)) {
      e.preventDefault();
      shell.openExternal(url).catch(() => undefined);
    }
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
  if (!/^https?:/i.test(url)) return;
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
  ipcMain.handle('state:load', () => storage.load());
  ipcMain.handle('state:save', (_e, json: string) => storage.save(json));
  ipcMain.on('page:register', (e, id: number, tabId: string) => pages.set(id, { tabId, host: e.sender }));
  ipcMain.on('page:unregister', (_e, id: number) => pages.delete(id));
  ipcMain.on('shortcuts:set', (_e, map: Record<string, string>, hotkey: string) => {
    shortcuts = map;
    if (hotkey !== littleHotkey) {
      littleHotkey = hotkey;
      registerGlobalHotkey();
    }
  });
  ipcMain.on('little:open', (_e, url: string) => createLittleWindow(url));
  ipcMain.on('little:to-main', (e, url: string, spaceId: string | null) => {
    const win = ensureMainWindow();
    const send = () => win.webContents.send('little-to-main', { url, spaceId });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
    win.show();
    win.focus();
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('arc:pick', async (e) => {
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
  ipcMain.handle('arc:read-default', () => {
    const p = arcDefaultPath();
    if (!existsSync(p)) return null;
    return { path: p, text: readFileSync(p, 'utf8') };
  });
  ipcMain.handle('browser:set-default', () => {
    const ok = app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https');
    return ok;
  });
  ipcMain.handle('browser:is-default', () => app.isDefaultProtocolClient('https'));
  ipcMain.handle('zap:start', async (_e, id: number) => {
    const wc = allWebContents.fromId(id);
    if (!wc) return null;
    try {
      return (await wc.executeJavaScript(zapPickerScript(), true)) as string | null;
    } catch {
      return null;
    }
  });
  ipcMain.handle('file:export', async (e, name: string, text: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('downloads'), name) });
    if (res.canceled || !res.filePath) return false;
    writeFileSync(res.filePath, text, 'utf8');
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
        { label: 'New Little Window', click: () => createLittleWindow('kite://new') },
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
    const url = argv.find((a) => /^https?:\/\//i.test(a));
    if (url) handleExternalUrl(url);
    else ensureMainWindow().focus();
  });

  // macOS sends links from other apps here (when Kite is the default browser).
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (app.isReady()) handleExternalUrl(url);
    else pendingExternal.push(url);
  });

  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') hardenWebview(contents);
    contents.on('will-attach-webview', (_ev, prefs, params) => {
      // Web pages never get Node or Kite's preload.
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
      if (!/^(https?|about|data|file):/i.test(params.src || 'about:blank')) params.src = 'about:blank';
    });
  });

  app.whenReady().then(() => {
    storage = new Storage(app.getPath('userData'));
    setupIpc();
    buildAppMenu();
    const argUrl = process.argv.find((a) => /^https?:\/\//i.test(a));
    if (argUrl) pendingExternal.push(argUrl);
    mainWindow = createMainWindow();
    app.on('activate', () => ensureMainWindow());
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

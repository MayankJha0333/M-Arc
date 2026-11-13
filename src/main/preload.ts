// Exposes a small, typed API to Kite's own UI. Web pages never get this
// (webviews have their preload removed, and the main process also checks
// that every message comes from Kite's own UI).

import { contextBridge, ipcRenderer } from 'electron';
import type { KiteBridge, LittleInit, OpenRequest } from '../shared/ipc';

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: Electron.IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

/**
 * Messages that can arrive before the UI has finished starting (links from other
 * apps, pages handed over from a little window) are held until someone listens.
 */
function buffered<T>(channel: string) {
  const queue: T[] = [];
  let listener: ((v: T) => void) | null = null;
  ipcRenderer.on(channel, (_e, v: T) => (listener ? listener(v) : queue.push(v)));
  return (cb: (v: T) => void) => {
    listener = cb;
    while (queue.length) cb(queue.shift()!);
    return () => {
      if (listener === cb) listener = null;
    };
  };
}

const onExternal = buffered<string>('external-url');
const onLittleToMain = buffered<{ url: string; spaceId: string | null }>('little-to-main');
const onLittleArchived = buffered<{ url: string; title: string }>('little-archived');

const api: KiteBridge = {
  isElectron: true,
  platform: process.platform,
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (json) => ipcRenderer.invoke('state:save', json),
  saveStateSync: (json) => ipcRenderer.sendSync('state:save-sync', json) === true,
  registerPage: (id, tabId) => ipcRenderer.send('page:register', id, tabId),
  unregisterPage: (id) => ipcRenderer.send('page:unregister', id),
  execIsolated: (id, code) => ipcRenderer.invoke('page:exec-isolated', id, code),
  pipEnter: (id) => ipcRenderer.invoke('pip:enter', id),
  pipExit: (id) => ipcRenderer.invoke('pip:exit', id),
  mediaPlaying: (id) => ipcRenderer.invoke('page:media-playing', id),
  debugLog: (msg) => ipcRenderer.send('debug:log', msg),
  pipFrameAction: (a) => ipcRenderer.send('pip-frame:action', a),
  pipFrameMedia: (cmd) => ipcRenderer.send('pip-frame:media', cmd),
  pipFrameDrag: (phase, edge) => ipcRenderer.send('pip-frame:drag', phase, edge),
  onPipFrameState: (cb) => listen<import('../shared/pipFrame').PipFrameState>('pip-frame-state', cb),
  onFocusTab: (cb) => listen<string>('focus-tab', cb),
  setPipTargets: (tabIds) => ipcRenderer.send('pip:targets', tabIds),
  onPipState: (cb) => listen<{ tabId: string; popped: boolean }>('pip-state', cb),
  setShortcuts: (map, hotkey) => ipcRenderer.send('shortcuts:set', map, hotkey),
  onShortcut: (cb) => listen<string>('shortcut', cb),
  onOpen: (cb) => listen<OpenRequest>('open-request', cb),
  onOpenSplit: (cb) => listen<{ url: string; sourceTabId: string }>('open-split', cb),
  onExternalUrl: onExternal,
  onLittleToMain,
  openLittle: (url) => ipcRenderer.send('little:open', url),
  moveLittleToMain: (url, spaceId) => ipcRenderer.send('little:to-main', url, spaceId),
  onLittleInit: (cb: (i: LittleInit) => void) => listen<LittleInit>('little-init', cb),
  archiveFromLittle: (url, title) => ipcRenderer.send('little:archive', url, title),
  onLittleArchived,
  pickArcFile: () => ipcRenderer.invoke('arc:pick'),
  readDefaultArcFile: () => ipcRenderer.invoke('arc:read-default'),
  setDefaultBrowser: () => ipcRenderer.invoke('browser:set-default'),
  isDefaultBrowser: () => ipcRenderer.invoke('browser:is-default'),
  exportFile: (name, text) => ipcRenderer.invoke('file:export', name, text),
  setWindowButtons: (v) => ipcRenderer.send('window:buttons', v),
  onWindowState: (cb) => listen('window-state', cb),
  setPrefs: (p) => ipcRenderer.send('prefs:set', p),
  shieldsStatus: () => ipcRenderer.invoke('shields:status'),
  refreshShields: () => ipcRenderer.invoke('shields:refresh'),
  onShieldsStatus: (cb) => listen('shields-status', cb),
  onShieldsCount: (cb) => listen('shields-count', cb),
  allowHttp: (host) => ipcRenderer.send('net:allow-http', host),
  permissions: () => ipcRenderer.invoke('permissions:list'),
  onPermissions: (cb) => listen('permissions-state', cb),
  forgetPermission: (site, permission) => ipcRenderer.send('permissions:forget', site, permission),
  clearData: (what, site) => ipcRenderer.invoke('privacy:clear', what, site),
  downloads: () => ipcRenderer.invoke('downloads:list'),
  onDownloads: (cb) => listen('downloads-state', cb),
  onDownloadDone: (cb) => listen('download-done', cb),
  downloadAction: (action, id) => ipcRenderer.invoke('downloads:act', action, id),
  pageMedia: (id) => ipcRenderer.invoke('media:list', id),
  downloadMedia: (id, url) => ipcRenderer.send('media:download', id, url),
  hlsVariants: (id, url) => ipcRenderer.invoke('media:hls-variants', id, url),
  downloadHls: (id, url, title) => ipcRenderer.send('media:hls-download', id, url, title),
  extensions: () => ipcRenderer.invoke('ext:list'),
  onExtensions: (cb) => listen('extensions-state', cb),
  extensionPick: (kind) => ipcRenderer.invoke('ext:pick', kind),
  extensionFromStore: (input) => ipcRenderer.invoke('ext:store', input),
  extensionConfirm: (token) => ipcRenderer.invoke('ext:confirm', token),
  extensionCancel: (token) => ipcRenderer.send('ext:cancel', token),
  extensionEnable: (id, enabled) => ipcRenderer.invoke('ext:enable', id, enabled),
  extensionRemove: (id) => ipcRenderer.invoke('ext:remove', id),
  extensionOpen: (id, which) => ipcRenderer.invoke('ext:open', id, which),
};

contextBridge.exposeInMainWorld('kite', api);

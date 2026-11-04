// Exposes a small, typed API to Kite's own UI. Web pages never get this.

import { contextBridge, ipcRenderer } from 'electron';
import type { KiteBridge, LittleInit, OpenRequest } from '../shared/ipc';

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: Electron.IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: KiteBridge = {
  isElectron: true,
  platform: process.platform,
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (json) => ipcRenderer.invoke('state:save', json),
  registerPage: (id, tabId) => ipcRenderer.send('page:register', id, tabId),
  unregisterPage: (id) => ipcRenderer.send('page:unregister', id),
  setShortcuts: (map, hotkey) => ipcRenderer.send('shortcuts:set', map, hotkey),
  onShortcut: (cb) => listen<string>('shortcut', cb),
  onOpen: (cb) => listen<OpenRequest>('open-request', cb),
  onOpenSplit: (cb) => listen<{ url: string; sourceTabId: string }>('open-split', cb),
  onExternalUrl: (cb) => listen<string>('external-url', cb),
  onLittleToMain: (cb) => listen<{ url: string; spaceId: string | null }>('little-to-main', cb),
  openLittle: (url) => ipcRenderer.send('little:open', url),
  moveLittleToMain: (url, spaceId) => ipcRenderer.send('little:to-main', url, spaceId),
  onLittleInit: (cb: (i: LittleInit) => void) => listen<LittleInit>('little-init', cb),
  archiveFromLittle: (url, title) => ipcRenderer.send('little:archive', url, title),
  onLittleArchived: (cb) => listen<{ url: string; title: string }>('little-archived', cb),
  pickArcFile: () => ipcRenderer.invoke('arc:pick'),
  readDefaultArcFile: () => ipcRenderer.invoke('arc:read-default'),
  setDefaultBrowser: () => ipcRenderer.invoke('browser:set-default'),
  isDefaultBrowser: () => ipcRenderer.invoke('browser:is-default'),
  startZap: (id) => ipcRenderer.invoke('zap:start', id),
  exportFile: (name, text) => ipcRenderer.invoke('file:export', name, text),
};

contextBridge.exposeInMainWorld('kite', api);

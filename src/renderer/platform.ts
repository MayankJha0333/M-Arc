// One interface for both the real Electron app and the plain-browser test mode.
// In test mode (no Electron), saving uses localStorage and web pages are simulated.

import type { KiteBridge, OpenRequest } from '@shared/ipc';

declare global {
  interface Window {
    kite?: KiteBridge;
    __kiteTest?: TestHooks;
  }
}

type Listener<T> = (v: T) => void;

class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(fn: Listener<T>) {
    this.ls.add(fn);
    return () => this.ls.delete(fn);
  }
  emit(v: T) {
    this.ls.forEach((fn) => fn(v));
  }
}

/** Hooks that end-to-end tests use to simulate things only Electron can do. */
export interface TestHooks {
  externalUrl(url: string): void;
  shortcut(action: string): void;
  openRequest(req: OpenRequest): void;
  littleOpened: string[];
  littleMoved: { url: string; spaceId: string | null }[];
  littleArchived(url: string, title: string): void;
  handOver(url: string, spaceId: string | null): void;
  exported: { name: string; text: string }[];
  arcFileText: string | null;
  now: number | null;
}

const STORAGE_KEY = 'kite-state';

function makeWebBridge(): KiteBridge {
  const shortcut = new Emitter<string>();
  const open = new Emitter<OpenRequest>();
  const external = new Emitter<string>();
  const split = new Emitter<{ url: string; sourceTabId: string }>();
  const littleToMain = new Emitter<{ url: string; spaceId: string | null }>();
  const littleArchived = new Emitter<{ url: string; title: string }>();
  const hooks: TestHooks = {
    externalUrl: (u) => external.emit(u),
    shortcut: (a) => shortcut.emit(a),
    openRequest: (r) => open.emit(r),
    littleOpened: [],
    littleMoved: [],
    littleArchived: (url, title) => littleArchived.emit({ url, title }),
    handOver: (url, spaceId) => littleToMain.emit({ url, spaceId }),
    exported: [],
    arcFileText: null,
    now: null,
  };
  window.__kiteTest = hooks;
  const platformName = /Mac/i.test(navigator.platform) ? 'darwin' : 'linux';
  return {
    isElectron: true as const, // shape-compatible; check `isElectron` below instead
    platform: new URLSearchParams(location.search).get('platform') ?? platformName,
    async loadState() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async saveState(json) {
      localStorage.setItem(STORAGE_KEY, json);
    },
    saveStateSync(json) {
      localStorage.setItem(STORAGE_KEY, json);
      return true;
    },
    execIsolated: async () => null,
    registerPage() {},
    unregisterPage() {},
    setShortcuts() {},
    onShortcut: (cb) => shortcut.on(cb),
    onOpen: (cb) => open.on(cb),
    onOpenSplit: (cb) => split.on(cb),
    onExternalUrl: (cb) => external.on(cb),
    onLittleToMain: (cb) => littleToMain.on(cb),
    openLittle: (url) => {
      hooks.littleOpened.push(url);
    },
    moveLittleToMain: (url, spaceId) => {
      hooks.littleMoved.push({ url, spaceId });
      littleToMain.emit({ url, spaceId });
    },
    archiveFromLittle: (url, title) => littleArchived.emit({ url, title }),
    onLittleArchived: (cb) => littleArchived.on(cb),
    onLittleInit: () => () => undefined,
    pickArcFile: async () => (hooks.arcFileText ? { path: 'StorableSidebar.json', text: hooks.arcFileText } : null),
    readDefaultArcFile: async () => (hooks.arcFileText ? { path: '~/Library/Application Support/Arc/StorableSidebar.json', text: hooks.arcFileText } : null),
    setDefaultBrowser: async () => true,
    isDefaultBrowser: async () => false,
    exportFile: async (name, text) => {
      hooks.exported.push({ name, text });
      return true;
    },
  };
}

export const isElectron = typeof window !== 'undefined' && !!window.kite;
export const bridge: KiteBridge = window.kite ?? makeWebBridge();
export const isMac = bridge.platform === 'darwin';
export const mode: 'main' | 'little' = new URLSearchParams(location.search).get('mode') === 'little' ? 'little' : 'main';

/** Current time; tests can freeze/advance it. */
export function now(): number {
  return window.__kiteTest?.now ?? Date.now();
}

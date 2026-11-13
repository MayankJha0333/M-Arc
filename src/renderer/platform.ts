// One interface for both the real Electron app and the plain-browser test mode.
// In test mode (no Electron), saving uses localStorage and web pages are simulated.

import type { KiteBridge, OpenRequest } from '@shared/ipc';
import { surface } from './surfaces';

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
  /** Simulate switching to another app (false) and back (true). */
  windowFocus(focused: boolean): void;
  /** Floating-video controls: buttons clicked, media commands, drags, and pushing its state. */
  pipFrameActions: string[];
  pipFrameMedia: unknown[];
  pipFrameDrags: string[];
  pipFrameState(v: import('@shared/pipFrame').PipFrameState): void;
  /** Simulate the floating video's "Back to tab". */
  focusTab(tabId: string): void;
  /** What the main process was told or asked (Shields, downloads, extensions, privacy). */
  prefs: import('@shared/ipc').Prefs | null;
  windowButtons: { visible: boolean; x: number; y: number }[];
  windowState(v: { fullscreen: boolean }): void;
  calls: string[];
  shieldsCount(tabId: string, count: number): void;
  setDownloads(list: import('@shared/downloads').DownloadEntry[]): void;
  downloadDone(entry: import('@shared/downloads').DownloadEntry): void;
  media: import('@shared/downloads').MediaItem[];
  hlsVariants: import('@shared/downloads').HlsVariant[];
  /** What "choose a folder/file" or the store returns next (an error text makes it fail). */
  extensionPreview: import('@shared/extensions').ExtensionPreview | string | null;
  permissions: import('@shared/ipc').SitePermission[];
}

const STORAGE_KEY = 'kite-state';

function makeWebBridge(): KiteBridge {
  const shortcut = new Emitter<string>();
  const open = new Emitter<OpenRequest>();
  const external = new Emitter<string>();
  const split = new Emitter<{ url: string; sourceTabId: string }>();
  const littleToMain = new Emitter<{ url: string; spaceId: string | null }>();
  const littleArchived = new Emitter<{ url: string; title: string }>();
  const pipState = new Emitter<{ tabId: string; popped: boolean }>();
  const pipFrameState = new Emitter<import('@shared/pipFrame').PipFrameState>();
  const focusTab = new Emitter<string>();
  const windowState = new Emitter<{ fullscreen: boolean }>();
  const shieldsCount = new Emitter<{ tabId: string; count: number }>();
  const shieldsStatus = new Emitter<import('@shared/ipc').ShieldsStatus>();
  const downloadsState = new Emitter<import('@shared/downloads').DownloadEntry[]>();
  const downloadDone = new Emitter<import('@shared/downloads').DownloadEntry>();
  const extState = new Emitter<import('@shared/extensions').ExtensionInfo[]>();
  const permState = new Emitter<import('@shared/ipc').SitePermission[]>();
  let dl: import('@shared/downloads').DownloadEntry[] = [];
  let exts: import('@shared/extensions').ExtensionInfo[] = [];
  const pendingExt = new Map<string, import('@shared/extensions').ExtensionPreview>();
  // Mirrors the main process: on leaving the app, pop out the first target that has a playing video.
  let pipTargets: string[] = [];
  let pipLeft: string | null = null;
  const windowFocus = async (focused: boolean) => {
    if (!focused) {
      if (pipLeft) return;
      for (const id of pipTargets) {
        if (await surface(id)?.popOutVideo()) {
          pipLeft = id;
          pipState.emit({ tabId: id, popped: true });
          return;
        }
      }
    } else if (pipLeft) {
      const id = pipLeft;
      pipLeft = null;
      await surface(id)?.returnVideo();
      pipState.emit({ tabId: id, popped: false });
    }
  };
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
    windowFocus: (f) => void windowFocus(f),
    pipFrameActions: [],
    pipFrameMedia: [],
    pipFrameDrags: [],
    pipFrameState: (v) => pipFrameState.emit(v),
    focusTab: (id) => focusTab.emit(id),
    prefs: null,
    windowButtons: [],
    windowState: (v) => windowState.emit(v),
    calls: [],
    shieldsCount: (tabId, count) => shieldsCount.emit({ tabId, count }),
    setDownloads: (list) => {
      dl = list;
      downloadsState.emit(dl);
    },
    downloadDone: (e) => downloadDone.emit(e),
    media: [],
    hlsVariants: [],
    extensionPreview: null,
    permissions: [],
  };
  const preview = (): import('@shared/ipc').Result<import('@shared/extensions').ExtensionPreview> => {
    const p = hooks.extensionPreview;
    return typeof p === 'string' ? { error: p } : p ? { value: p } : { error: 'Nothing chosen' };
  };
  const pushExt = () => extState.emit([...exts]);
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
    pipEnter: async () => false,
    pipExit: async () => undefined,
    mediaPlaying: async () => false,
    debugLog() {},
    pipFrameAction: (a) => void hooks.pipFrameActions.push(a),
    pipFrameMedia: (cmd) => void hooks.pipFrameMedia.push(cmd),
    pipFrameDrag: (phase, edge) => void hooks.pipFrameDrags.push(edge ? `${phase}:${edge}` : phase),
    onPipFrameState: (cb) => pipFrameState.on(cb),
    onFocusTab: (cb) => focusTab.on(cb),
    setPipTargets: (ids) => {
      pipTargets = [...ids];
    },
    onPipState: (cb) => pipState.on(cb),
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
    setWindowButtons: (v) => void hooks.windowButtons.push(v),
    onWindowState: (cb) => windowState.on(cb),
    setPrefs: (p) => {
      hooks.prefs = p;
    },
    shieldsStatus: async () => ({ source: 'builtin', updatedAt: 0, updating: false }),
    refreshShields: async () => {
      hooks.calls.push('refreshShields');
      const st = { source: 'full' as const, updatedAt: Date.now(), updating: false };
      shieldsStatus.emit(st);
      return st;
    },
    onShieldsStatus: (cb) => shieldsStatus.on(cb),
    onShieldsCount: (cb) => shieldsCount.on(cb),
    allowHttp: (host) => void hooks.calls.push(`allowHttp:${host}`),
    permissions: async () => hooks.permissions,
    onPermissions: (cb) => permState.on(cb),
    forgetPermission: (site, permission) => {
      hooks.calls.push(`forget:${site ?? '*'}:${permission ?? '*'}`);
      hooks.permissions = hooks.permissions.filter((p) => !((!site || p.site === site) && (!permission || p.permission === permission)));
      permState.emit(hooks.permissions);
    },
    clearData: async (what, site) => void hooks.calls.push(`clear:${site ?? '*'}:${Object.entries(what).filter(([, v]) => v).map(([k]) => k).join('+')}`),
    downloads: async () => dl,
    onDownloads: (cb) => downloadsState.on(cb),
    onDownloadDone: (cb) => downloadDone.on(cb),
    downloadAction: async (action, id) => {
      hooks.calls.push(`download:${action}:${id ?? ''}`);
      if (action === 'clear') dl = dl.filter((d) => d.state === 'progressing' || d.state === 'paused');
      else if (action === 'remove') dl = dl.filter((d) => d.id !== id);
      else dl = dl.map((d) => (d.id !== id ? d : action === 'pause' ? { ...d, state: 'paused' as const } : action === 'resume' ? { ...d, state: 'progressing' as const } : action === 'cancel' ? { ...d, state: 'cancelled' as const } : d));
      downloadsState.emit(dl);
      return null;
    },
    pageMedia: async () => hooks.media,
    downloadMedia: (_id, url) => void hooks.calls.push(`media:${url}`),
    hlsVariants: async () => ({ value: hooks.hlsVariants }),
    downloadHls: (_id, url) => void hooks.calls.push(`hls:${url}`),
    extensions: async () => exts,
    onExtensions: (cb) => extState.on(cb),
    extensionPick: async () => {
      const r = preview();
      if (r.value) pendingExt.set(r.value.token, r.value);
      return hooks.extensionPreview === null ? { value: null } : r;
    },
    extensionFromStore: async () => {
      const r = preview();
      if (r.value) pendingExt.set(r.value.token, r.value);
      return r;
    },
    extensionConfirm: async (token) => {
      const p = pendingExt.get(token);
      if (!p) return { error: 'That install is no longer waiting.' };
      pendingExt.delete(token);
      const { token: _t, ...rest } = p;
      exts = [...exts, { ...rest, id: `x-${exts.length + 1}`, enabled: true, installedAt: Date.now() }];
      pushExt();
      return { value: true };
    },
    extensionCancel: (token) => void pendingExt.delete(token),
    extensionEnable: async (id, enabled) => {
      exts = exts.map((x) => (x.id === id ? { ...x, enabled } : x));
      pushExt();
    },
    extensionRemove: async (id) => {
      exts = exts.filter((x) => x.id !== id);
      pushExt();
    },
    extensionOpen: async (id, which) => {
      hooks.calls.push(`extOpen:${id}:${which}`);
      return true;
    },
  };
}

export const isElectron = typeof window !== 'undefined' && !!window.kite;
/** Tests in a plain browser can ask for the desktop app's layout with ?chrome=electron. */
export const desktopChrome = isElectron || new URLSearchParams(location.search).get('chrome') === 'electron';
export const bridge: KiteBridge = window.kite ?? makeWebBridge();
export const isMac = bridge.platform === 'darwin';
const modeParam = new URLSearchParams(location.search).get('mode');
export const mode: 'main' | 'little' | 'pip' = modeParam === 'little' ? 'little' : modeParam === 'pip' ? 'pip' : 'main';

/** Current time; tests can freeze/advance it. */
export function now(): number {
  return window.__kiteTest?.now ?? Date.now();
}

// The app's live state. `s` is the saved AppState; `ui` is short-lived screen state.

import { create } from 'zustand';
import { produce } from 'immer';
import { createInitialState } from '@shared/defaults';
import { serialize } from '@shared/persistence';
import type { AppState, ID } from '@shared/types';
import { bridge } from './platform';
import { keepAwake } from '@shared/sleep';

export type Panel = 'settings' | 'archive' | 'boosts' | 'boost' | 'routing' | 'import' | 'space' | 'shortcuts' | 'downloads' | 'extensions' | null;

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  action?: () => void;
  /** Playing its exit animation; removed a moment later. */
  leaving?: boolean;
}

export interface ContextMenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  submenu?: ContextMenuItem[];
  separator?: boolean;
  testId?: string;
}

export interface UiState {
  ready: boolean;
  commandBar: null | { mode: 'new' | 'edit'; initial: string; target?: 'split' };
  peek: null | { url: string; sourceTabId: string | null; title?: string };
  panel: Panel;
  panelArg?: string;
  toasts: Toast[];
  /** Tabs whose page is kept alive, most recent last. */
  loaded: ID[];
  loading: Record<ID, boolean>;
  nav: Record<ID, { back: boolean; forward: boolean }>;
  renaming: ID | null;
  menu: null | { x: number; y: number; items: ContextMenuItem[] };
  sidebarPeek: boolean; // hidden sidebar temporarily shown by hovering the edge
  findOpen: boolean;
  zapping: boolean;
  /** Tabs with a video or sound playing right now. */
  playing: Record<ID, boolean>;
  muted: Record<ID, boolean>;
  /** Tabs whose video Kite popped out automatically. */
  pipped: ID[];
  /** A look being previewed in Settings → Appearance (not saved until Apply). */
  lookDraft: import('@shared/look').LookDraft | null;
  downloads: import('@shared/downloads').DownloadEntry[];
  /** Ads and trackers blocked on each tab's current page. */
  blocked: Record<ID, number>;
  /** Tabs whose page failed to load, and why. */
  loadError: Record<ID, { code: number; desc: string; url: string } | undefined>;
  /** The "about this site" popover under the address bar. */
  siteInfo: boolean;
  fullscreen: boolean;
}

interface Store {
  s: AppState;
  ui: UiState;
  /** Change saved state. Returns whatever the function returns. */
  act<R>(fn: (d: AppState) => R): R;
  setUi(patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)): void;
  load(state: AppState): void;
}

const MAX_LOADED = 10;

export const useKite = create<Store>((set, get) => ({
  s: createInitialState(),
  ui: {
    ready: false,
    commandBar: null,
    peek: null,
    panel: null,
    toasts: [],
    loaded: [],
    loading: {},
    nav: {},
    renaming: null,
    menu: null,
    sidebarPeek: false,
    findOpen: false,
    zapping: false,
    playing: {},
    muted: {},
    pipped: [],
    lookDraft: null,
    downloads: [],
    blocked: {},
    loadError: {},
    siteInfo: false,
    fullscreen: false,
  },
  act(fn) {
    let out: ReturnType<typeof fn> | undefined;
    const next = produce(get().s, (d) => {
      out = fn(d as AppState);
    });
    if (next !== get().s) set({ s: next });
    return out as ReturnType<typeof fn>;
  },
  setUi(patch) {
    set((st) => ({ ui: { ...st.ui, ...(typeof patch === 'function' ? patch(st.ui) : patch) } }));
  },
  load(state) {
    set((st) => ({ s: state, ui: { ...st.ui, ready: true } }));
  },
}));

export const act = <R,>(fn: (d: AppState) => R): R => useKite.getState().act(fn);
export const setUi = (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => useKite.getState().setUi(patch);
export const getS = () => useKite.getState().s;
export const getUi = () => useKite.getState().ui;

let toastSeq = 1;
export function toast(text: string, actionLabel?: string, action?: () => void, ms = 4200) {
  const id = toastSeq++;
  setUi((u) => ({ toasts: [...u.toasts.slice(-3), { id, text, actionLabel, action }] }));
  // Leave cleanly: mark it leaving (it eases out), then remove it once the exit has played.
  const exitMs = Math.round(130 / Math.max(0.25, getS()?.settings?.motionSpeed ?? 1));
  setTimeout(() => setUi((u) => ({ toasts: u.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })), Math.max(0, ms - exitMs));
  setTimeout(() => setUi((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) })), ms);
}

/** Keep a tab's page alive (least-recently-used ones get unloaded). */
export function markLoaded(id: ID) {
  setUi((u) => {
    const limit = getS().settings.awakeTabs ?? MAX_LOADED;
    // Never put to sleep a tab that is playing, or whose video is floating.
    const s = getS();
    const shown = s.items[s.activeBySpace[s.activeSpaceId] ?? ''];
    const visible = shown?.kind === 'split' ? shown.panes : [];
    return { loaded: keepAwake(u.loaded, id, limit, (x) => !!u.playing[x] || u.pipped.includes(x) || visible.includes(x)) };
  });
}

export function unload(id: ID) {
  setUi((u) => ({ loaded: u.loaded.filter((x) => x !== id) }));
}

// ---- autosave --------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: AppState | null = null;

let failures = 0;

export function flushSave(sync = false) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const s = getS();
  if (s === lastSaved) return;
  const json = serialize(s);
  if (sync) {
    if (bridge.saveStateSync(json)) lastSaved = s;
    return;
  }
  bridge
    .saveState(json)
    .then(() => {
      if (getS() === s) lastSaved = s;
      failures = 0;
    })
    .catch(() => {
      // Keep the change marked unsaved and try again shortly.
      failures++;
      if (failures === 3) toast('Kite couldn’t save your changes. It will keep trying.');
      saveTimer = setTimeout(() => flushSave(), Math.min(30_000, 1000 * failures));
    });
}

export function startAutosave() {
  lastSaved = getS();
  useKite.subscribe((st, prev) => {
    if (st.s === prev.s || !st.ui.ready) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 350);
  });
  window.addEventListener('beforeunload', () => flushSave(true));
}

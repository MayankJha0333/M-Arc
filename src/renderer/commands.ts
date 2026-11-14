// Every user action in one place. Shortcuts, menus and the command bar all call these.

import * as ops from '@shared/ops';
import { hostOf, isNewTabUrl, NEW_TAB_URL, normalizeInput } from '@shared/url';
import { locate } from '@shared/tree';
import type { ID } from '@shared/types';
import { act, getS, getUi, markLoaded, setUi, toast, unload, useKite } from './store';
import { createFolder, deleteFolder, setAllFolders } from '@shared/folders';
import { createSpace, nthSpace, stepSpace, switchSpace } from '@shared/spaces';
import { clearToday, runAutoArchive } from '@shared/archive';
import * as split from '@shared/split';
import { createNote } from '@shared/notes';
import { onStageDrop } from './dnd';
import type { AppState } from '@shared/types';
import { surface } from './surfaces';
import { bridge, now } from './platform';
import { sleepAllBut } from '@shared/sleep';

export type OpenWhere = 'current' | 'new' | 'background' | 'peek' | 'little' | 'split';

/** Open a URL (or search) somewhere. */
export function openUrl(input: string, where: OpenWhere = 'new', opts: { spaceId?: ID; sourceTabId?: string | null } = {}): ID | null {
  const s = getS();
  const url = /^kite:/i.test(input) ? input : normalizeInput(input, s.settings.searchEngine);
  if (!url) return null;
  if (where === 'little') {
    bridge.openLittle(url);
    return null;
  }
  if (where === 'split') {
    return openInSplit(url);
  }
  if (where === 'peek') {
    setUi({ peek: { url, sourceTabId: opts.sourceTabId ?? null } });
    return null;
  }
  if (where === 'current') {
    const tab = ops.activeTab(s);
    if (tab) {
      navigateTab(tab.id, url);
      return tab.id;
    }
  }
  const id = act((d) => ops.newTab(d, { url, now: now(), activate: where !== 'background', spaceId: opts.spaceId }));
  if (where !== 'background') markLoaded(id);
  return id;
}

/** Filled in by pipRuntime (kept separate to avoid an import loop). */
export const pipHooks = { toggle: async () => undefined as void, mute: () => undefined as void };

let boostHook: () => void = () => setUi({ panel: 'boosts' });
export function setBoostHook(fn: () => void) {
  boostHook = fn;
}

let closePeekHook: () => void = () => setUi({ peek: null });
export function setClosePeek(fn: () => void) {
  closePeekHook = fn;
}

/** Open a page next to the current one (makes or grows a split view). */
export function openInSplit(url: string): ID | null {
  const id = act((d) => split.openInSplit(d, url, now()));
  if (!id) {
    toast('A split view holds up to 4 pages');
    return null;
  }
  markLoaded(id);
  const it = getS().items[activeId() ?? ''];
  if (it?.kind === 'split') it.panes.forEach(markLoaded);
  return id;
}

/** Combine a sidebar tab with what's showing (drag onto the page, or menu). */
export function splitWithCmd(tabId: ID) {
  const r = act((d) => split.splitWith(d, tabId, now()));
  if (!r) return toast('Can’t add that to a split view');
  const it = getS().items[r];
  if (it?.kind === 'split') it.panes.forEach(markLoaded);
}

onStageDrop((id) => {
  if (getS().items[id]?.kind === 'tab') splitWithCmd(id);
});

/** Point an existing tab at a new URL. */
export function navigateTab(id: ID, url: string) {
  const h = surface(id);
  if (h) h.load(url);
  else {
    const it = getS().items[id];
    // Leaving the new-tab page: the tab takes the site's name until the page reports its title.
    const fromStart = it?.kind === 'tab' && isNewTabUrl(it.url);
    act((d) => ops.updateTab(d, id, fromStart ? { url, title: hostOf(url) || url } : { url }, now()));
    markLoaded(id);
  }
}

/** Ask the start page on screen to put the cursor in its search box. */
export function focusStartPage() {
  window.dispatchEvent(new Event('kite:focus-start'));
}

/**
 * The sidebar's "New Tab": opens a real new tab showing the start page, ready to type.
 * If you're already on an empty new tab, it just puts the cursor back in its box.
 */
export function newTabPage() {
  const tab = ops.activeTab(getS());
  if (tab && isNewTabUrl(tab.url)) return focusStartPage();
  act((d) => ops.newTab(d, { url: NEW_TAB_URL, title: 'New Tab', now: now() }));
  setUi({ commandBar: null });
}

export function selectItem(id: ID, opts?: { keepSettings?: boolean }) {
  // Picking a tab (even the one already selected) leaves the Settings page —
  // but switching Space does not, so you can style each Space from Settings.
  const p = useKite.getState().ui.panel;
  if (!opts?.keepSettings && (p === 'settings' || p === 'shortcuts')) setUi({ panel: null, panelArg: undefined });
  act((d) => ops.select(d, id, now()));
  const it = getS().items[id];
  if (it?.kind === 'tab') markLoaded(id);
  if (it?.kind === 'split') it.panes.forEach(markLoaded);
}

/** Close an item and offer Undo for tabs that really go away. */
export function closeItemCmd(id: ID) {
  const s = getS();
  const it = s.items[id];
  if (!it) return;
  const loc = locate(s, id);
  const keepsPlace = it.kind === 'tab' && (loc?.list === 'pinned' || loc?.list === 'favorites');
  act((d) => ops.closeItem(d, id, now()));
  unload(id);
  if (it.kind === 'split') it.panes.forEach(unload);
  if (!keepsPlace) {
    toast(`Closed “${ops.displayTitle(it).slice(0, 40)}”`, 'Undo', () => reopen());
  }
  const next = ops.activeItemId(getS());
  if (next) selectItem(next);
}

/** Run a change and offer Undo (restores the whole state from before). */
export function undoable(label: string, fn: (d: AppState) => void) {
  const before = getS();
  act(fn);
  toast(label, 'Undo', () => useKite.setState({ s: before }));
}

export function newFolderCmd(opts: { items?: ID[]; parentId?: ID | null } = {}) {
  const id = act((d) => createFolder(d, { now: now(), items: opts.items, parentId: opts.parentId ?? null }));
  setUi({ renaming: id });
  return id;
}

export function deleteFolderCmd(id: ID) {
  const it = getS().items[id];
  if (it?.kind !== 'folder') return;
  const n = it.children.length;
  undoable(n ? `Deleted “${it.title}” · ${n} item${n === 1 ? '' : 's'} moved to Archive` : `Deleted “${it.title}”`, (d) => void deleteFolder(d, id, now()));
}

/** After a Space change, make sure its selected page is loaded. */
function afterSpaceChange() {
  const id = activeId();
  if (id) selectItem(id, { keepSettings: true });
}

export function switchSpaceCmd(id: ID) {
  act((d) => switchSpace(d, id));
  afterSpaceChange();
}

/** Archive stale Today tabs now (also runs every minute). */
export function autoArchiveNow() {
  const n = act((d) => runAutoArchive(d, now()));
  if (n > 0) {
    setUi((u) => ({ loaded: u.loaded.filter((id) => getS().items[id]) }));
    toast(`Auto-archived ${n} tab${n === 1 ? '' : 's'}`, 'View', () => setUi({ panel: 'archive' }));
  }
  return n;
}

export function reopen() {
  const id = act((d) => ops.reopenClosed(d, now()));
  if (id) selectItem(id);
  else toast('Nothing to reopen');
}

export function activeId(): ID | null {
  return ops.activeItemId(getS());
}

function activeTabId(): ID | null {
  return ops.activeTab(getS())?.id ?? null;
}

/** Copy the current page as a Markdown link: [Title](https://…). */
export async function copyActiveMarkdown(id?: ID) {
  const t = id ? getS().items[id] : ops.activeTab(getS());
  if (!t || t.kind !== 'tab') return;
  const title = ops.displayTitle(t).replace(/([\[\]])/g, '\\$1');
  const url = t.url.replace(/\)/g, '%29');
  try {
    await navigator.clipboard.writeText(`[${title}](${url})`);
  } catch {
    /* clipboard may be unavailable in tests */
  }
  toast('Copied as Markdown link');
}

/** Tabs you can see right now (the active tab, or every page of a split). */
function visibleTabs(): ID[] {
  const id = activeId();
  const it = id ? getS().items[id] : null;
  return !it ? [] : it.kind === 'split' ? it.panes : it.kind === 'tab' ? [it.id] : [];
}

/** Unload a tab's page to free memory. It reloads when you open it again. */
export function sleepTab(id: ID) {
  const u = getUi();
  if (visibleTabs().includes(id) || u.playing[id] || u.pipped.includes(id)) return toast('This tab is in use, so it stays awake');
  unload(id);
  toast('Tab is asleep. It wakes when you open it');
}

/** Put every tab to sleep except what you are looking at and anything playing. */
export function sleepOtherTabs() {
  const u = getUi();
  const keep = new Set([...visibleTabs(), ...u.pipped, ...Object.keys(u.playing).filter((k) => u.playing[k])]);
  const n = u.loaded.filter((x) => !keep.has(x)).length;
  setUi({ loaded: sleepAllBut(u.loaded, (x) => keep.has(x)) });
  toast(n ? `Put ${n} tab${n === 1 ? '' : 's'} to sleep` : 'No other tabs are awake');
}

/** Mute or unmute every tab that is playing sound. */
export function muteAll(mute: boolean) {
  const u = getUi();
  const ids = [...new Set([...u.loaded, ...Object.keys(u.playing)])];
  for (const id of ids) surface(id)?.setMuted(mute);
  const muted = { ...u.muted };
  for (const id of ids) muted[id] = mute;
  setUi({ muted });
  toast(mute ? 'All tabs muted' : 'All tabs unmuted');
}

export async function copyActiveUrl() {
  const t = ops.activeTab(getS());
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t.url);
  } catch {
    /* clipboard may be unavailable in tests */
  }
  toast('Copied URL');
}

/** Actions reachable by name (keyboard shortcuts and the command bar use these ids). */
export const actions: Record<string, () => void> = {
  commandBar: () => setUi({ commandBar: { mode: 'new', initial: '' } }),
  editUrl: () => {
    const t = ops.activeTab(getS());
    // On the start page, the address bar is its own big box.
    if (t && isNewTabUrl(t.url)) return focusStartPage();
    setUi({ commandBar: { mode: t ? 'edit' : 'new', initial: t?.url ?? '' } });
  },
  newTabPage: () => newTabPage(),
  closeTab: () => {
    const ui = getUi();
    if (ui.peek) return closePeekHook();
    if (ui.commandBar) return setUi({ commandBar: null });
    const id = activeId();
    if (id) closeItemCmd(id);
  },
  reopenClosed: () => reopen(),
  togglePin: () => {
    const id = activeId();
    if (!id) return;
    const pinned = act((d) => {
      ops.togglePin(d, id);
      return ops.isPinnedOrFavorite(d, id);
    });
    toast(pinned ? 'Pinned' : 'Unpinned');
  },
  toggleSidebar: () => act((d) => void (d.settings.sidebarCollapsed = !d.settings.sidebarCollapsed)),
  copyUrl: () => void copyActiveUrl(),
  copyMarkdown: () => void copyActiveMarkdown(),
  sleepOthers: () => sleepOtherTabs(),
  muteAll: () => muteAll(true),
  unmuteAll: () => muteAll(false),
  reload: () => surface(activeTabId())?.reload(),
  back: () => surface(activeTabId())?.back(),
  forward: () => surface(activeTabId())?.forward(),
  nextTab: () => {
    act((d) => ops.cycleTab(d, 1, now()));
    const id = activeId();
    if (id) selectItem(id);
  },
  prevTab: () => {
    act((d) => ops.cycleTab(d, -1, now()));
    const id = activeId();
    if (id) selectItem(id);
  },
  settings: () => setUi({ panel: 'settings', panelArg: undefined }),
  shortcutsPanel: () => setUi({ panel: 'shortcuts' }),
  newFolder: () => void newFolderCmd(),
  newSplit: () => {
    if (!activeId()) return setUi({ commandBar: { mode: 'new', initial: '' } });
    setUi({ commandBar: { mode: 'new', initial: '', target: 'split' } });
  },
  unsplit: () => {
    const id = activeId();
    if (id && getS().items[id]?.kind === 'split') act((d) => void ops.unsplit(d, id, now()));
  },
  newSpace: () => {
    const id = act((d) => createSpace(d, {}));
    setUi({ panel: 'space', panelArg: id });
  },
  addFavorite: () => {
    const t = ops.activeTab(getS());
    if (t && act((d) => ops.addFavorite(d, t.id))) toast('Added to Favorites');
  },
  toggleTheme: () =>
    act((d) => {
      const sp = d.spaces.find((x) => x.id === d.activeSpaceId)!;
      const dark = sp.theme.mode === 'dark' || (sp.theme.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      sp.theme.mode = dark ? 'light' : 'dark';
    }),
  archivePage: () => setUi({ panel: 'archive' }),
  clearToday: () => {
    const sp = getS().activeSpaceId;
    const n = getS().spaces.find((x) => x.id === sp)?.today.length ?? 0;
    if (!n) return;
    const loaded = getUi().loaded;
    undoable(`Archived ${n} tab${n === 1 ? '' : 's'}`, (d) => void clearToday(d, sp, now()));
    setUi({ loaded: loaded.filter((id) => getS().items[id]) });
  },
  runAutoArchive: () => autoArchiveNow(),
  closePeek: () => closePeekHook(),
  littleWindow: () => bridge.openLittle('kite://new'),
  boostEditor: () => boostHook(),
  popOutVideo: () => void pipHooks.toggle(),
  toggleMute: () => pipHooks.mute(),
  newNote: () => void act((d) => createNote(d, { now: now() })),
  boostsPanel: () => setUi({ panel: 'boosts' }),
  routingPanel: () => setUi({ panel: 'routing' }),
  importArc: () => setUi({ panel: 'import' }),
  downloadsPanel: () => setUi({ panel: 'downloads' }),
  extensionsPanel: () => setUi({ panel: 'extensions' }),
  privacyPanel: () => setUi({ panel: 'settings', panelArg: 'privacy' }),
  siteInfo: () => setUi((u) => ({ siteInfo: !u.siteInfo })),
  toggleShields: () => {
    const on = act((d) => {
      d.settings.shields = { ...d.settings.shields, enabled: !d.settings.shields.enabled };
      return d.settings.shields.enabled;
    });
    surface(activeTabId())?.reload();
    toast(on ? 'Shields are on' : 'Shields are off everywhere');
  },
  nextSpace: () => {
    act((d) => stepSpace(d, 1));
    afterSpaceChange();
  },
  prevSpace: () => {
    act((d) => stepSpace(d, -1));
    afterSpaceChange();
  },
  collapseFolders: () => act((d) => setAllFolders(d, d.activeSpaceId, true)),
  expandFolders: () => act((d) => setAllFolders(d, d.activeSpaceId, false)),
  findInPage: () => setUi({ findOpen: true }),
  zoomIn: () => surface(activeTabId())?.zoom(1),
  zoomOut: () => surface(activeTabId())?.zoom(-1),
  zoomReset: () => surface(activeTabId())?.zoom('reset'),
};

export function runAction(name: string) {
  const fn = actions[name];
  if (fn) fn();
}

for (let n = 1; n <= 9; n++) {
  actions[`space${n}`] = () => {
    act((d) => nthSpace(d, n));
    afterSpaceChange();
  };
  actions[`tab${n}`] = () => {
    act((d) => ops.selectNth(d, n, now()));
    const id = activeId();
    if (id) selectItem(id);
  };
}

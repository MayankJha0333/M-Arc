// Every user action in one place. Shortcuts, menus and the command bar all call these.

import * as ops from '@shared/ops';
import { normalizeInput } from '@shared/url';
import { locate } from '@shared/tree';
import type { ID } from '@shared/types';
import { act, getS, getUi, markLoaded, setUi, toast, unload } from './store';
import { surface } from './surfaces';
import { bridge, now } from './platform';

export type OpenWhere = 'current' | 'new' | 'background' | 'peek' | 'little';

/** Open a URL (or search) somewhere. */
export function openUrl(input: string, where: OpenWhere = 'new', opts: { spaceId?: ID; sourceTabId?: string | null } = {}): ID | null {
  const s = getS();
  const url = /^kite:/i.test(input) ? input : normalizeInput(input, s.settings.searchEngine);
  if (!url) return null;
  if (where === 'little') {
    bridge.openLittle(url);
    return null;
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

/** Point an existing tab at a new URL. */
export function navigateTab(id: ID, url: string) {
  const h = surface(id);
  if (h) h.load(url);
  else {
    act((d) => ops.updateTab(d, id, { url }, now()));
    markLoaded(id);
  }
}

export function selectItem(id: ID) {
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
    setUi({ commandBar: { mode: t ? 'edit' : 'new', initial: t?.url ?? '' } });
  },
  closeTab: () => {
    const ui = getUi();
    if (ui.peek) return setUi({ peek: null });
    if (ui.commandBar) return setUi({ commandBar: null });
    const id = activeId();
    if (id) closeItemCmd(id);
  },
  reopenClosed: () => reopen(),
  toggleSidebar: () => act((d) => void (d.settings.sidebarCollapsed = !d.settings.sidebarCollapsed)),
  copyUrl: () => void copyActiveUrl(),
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
  settings: () => setUi({ panel: 'settings' }),
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
  actions[`tab${n}`] = () => {
    act((d) => ops.selectNth(d, n, now()));
    const id = activeId();
    if (id) selectItem(id);
  };
}

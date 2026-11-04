// Every change to Kite's state is one of these functions.
// They mutate an immer draft, so they're easy to unit-test with produce().

import { newId } from './ids';
import type { AppState, ID, Item, ListName, TabItem } from './types';
import { attach, detach, flatVisible, listAt, locate, ownerSplit, purge } from './tree';
import { hostOf, tidyTitle } from './url';

const MAX_CLOSED = 30;
const MAX_HISTORY = 5000;

export interface NewTabOpts {
  url: string;
  title?: string;
  spaceId?: ID;
  activate?: boolean;
  now: number;
  list?: ListName;
  parentId?: ID | null;
  index?: number;
}

/** Open a new tab. By default it goes to the top of Today in the active Space. */
export function newTab(s: AppState, o: NewTabOpts): ID {
  const id = newId('tab');
  const tab: TabItem = {
    id,
    kind: 'tab',
    url: o.url,
    title: o.title ?? (hostOf(o.url) || o.url),
    createdAt: o.now,
    lastActiveAt: o.now,
  };
  s.items[id] = tab;
  recordVisit(s, o.url, tab.title, o.now);
  const spaceId = o.spaceId ?? s.activeSpaceId;
  const list = o.list ?? 'today';
  if (list !== 'today') tab.homeUrl = o.url;
  attach(s, id, { list, spaceId: list === 'favorites' ? null : spaceId, parentId: o.parentId ?? null, index: o.index ?? 0 });
  if (o.activate !== false) {
    if (spaceId !== s.activeSpaceId) s.activeSpaceId = spaceId;
    select(s, id, o.now);
  }
  return id;
}

/** Make an item the selected one in the current Space. */
export function select(s: AppState, id: ID | null, now: number): void {
  if (id === null) {
    s.activeBySpace[s.activeSpaceId] = null;
    return;
  }
  const split = s.items[id] ? ownerSplit(s, id) : null;
  const target = split ? split.id : id;
  const it = s.items[target];
  if (!it) return;
  if (split) split.focused = Math.max(0, split.panes.indexOf(id));
  const loc = locate(s, target);
  if (loc && loc.spaceId && loc.spaceId !== s.activeSpaceId) s.activeSpaceId = loc.spaceId;
  s.activeBySpace[s.activeSpaceId] = target;
  touch(s, target, now);
  // Opening a collapsed folder's child reveals it.
  if (loc?.parentId) {
    let p: ID | null = loc.parentId;
    while (p) {
      const f = s.items[p];
      if (f?.kind === 'folder') f.collapsed = false;
      p = locate(s, p)?.parentId ?? null;
    }
  }
}

export function touch(s: AppState, id: ID, now: number): void {
  const it = s.items[id];
  if (!it) return;
  if (it.kind === 'tab' || it.kind === 'note' || it.kind === 'split') it.lastActiveAt = now;
  if (it.kind === 'split') it.panes.forEach((p) => touch(s, p, now));
}

export function activeItemId(s: AppState): ID | null {
  const id = s.activeBySpace[s.activeSpaceId] ?? null;
  return id && s.items[id] ? id : null;
}

/** The tab that currently has focus (inside a split, the focused pane). */
export function activeTab(s: AppState): TabItem | null {
  const id = activeItemId(s);
  if (!id) return null;
  const it = s.items[id];
  if (it.kind === 'tab') return it;
  if (it.kind === 'split') {
    const t = s.items[it.panes[it.focused] ?? it.panes[0]];
    return t?.kind === 'tab' ? t : null;
  }
  return null;
}

/** Page reported a new URL/title/icon. */
export function updateTab(s: AppState, id: ID, patch: Partial<Pick<TabItem, 'url' | 'title' | 'favicon'>>, now: number): void {
  const t = s.items[id];
  if (!t || t.kind !== 'tab') return;
  const urlChanged = patch.url !== undefined && patch.url !== t.url;
  if (urlChanged) {
    if (patch.favicon === undefined && hostOf(patch.url!) !== hostOf(t.url)) t.favicon = undefined;
    t.url = patch.url!;
  }
  if (patch.title !== undefined && patch.title.trim()) {
    t.title = patch.title;
    const h = s.history.find((x) => x.url === t.url);
    if (h) h.title = patch.title;
  }
  if (patch.favicon !== undefined) t.favicon = patch.favicon || undefined;
  if (urlChanged) recordVisit(s, t.url, patch.title ?? t.title, now);
}

export function recordVisit(s: AppState, url: string, title: string, now: number): void {
  if (!/^https?:/i.test(url)) return;
  const h = s.history.find((x) => x.url === url);
  if (h) {
    h.visits += 1;
    h.lastVisitAt = now;
    if (title) h.title = title;
  } else {
    s.history.unshift({ url, title, visits: 1, lastVisitAt: now });
    if (s.history.length > MAX_HISTORY) s.history.length = MAX_HISTORY;
  }
}

export function renameItem(s: AppState, id: ID, title: string): void {
  const it = s.items[id];
  if (!it) return;
  const t = title.trim();
  if (it.kind === 'tab') it.customTitle = t || undefined;
  else if (it.kind === 'folder' || it.kind === 'note') it.title = t || it.title;
}

export function displayTitle(it: Item): string {
  if (it.kind === 'tab') return it.customTitle || it.title || it.url;
  if (it.kind === 'split') return 'Split view';
  return it.title;
}

/** Pick what to select after an item disappears: next sibling, else previous, else nothing. */
function neighborAfterRemoval(s: AppState, spaceId: ID, removedId: ID): ID | null {
  const order = flatVisible(s, spaceId, false);
  const i = order.indexOf(removedId);
  if (i < 0) return null;
  return order[i + 1] ?? order[i - 1] ?? null;
}

/**
 * Close an item.
 * - Today tabs/notes/splits are removed (and can be reopened).
 * - Pinned and Favorite tabs stay in the sidebar but reset to their home URL.
 */
export function closeItem(s: AppState, id: ID, now: number): void {
  const it = s.items[id];
  if (!it) return;
  const split = ownerSplit(s, id);
  if (split) {
    removeFromSplit(s, split.id, id, now);
    return;
  }
  const loc = locate(s, id);
  if (!loc) return;
  const spaceId = loc.spaceId ?? s.activeSpaceId;
  const wasActive = s.activeBySpace[spaceId] === id || (loc.list === 'favorites' && s.activeBySpace[s.activeSpaceId] === id);

  if (it.kind === 'tab' && (loc.list === 'pinned' || loc.list === 'favorites')) {
    if (it.homeUrl) it.url = it.homeUrl;
    if (wasActive) {
      const next = loc.list === 'favorites' ? null : neighborAfterRemoval(s, spaceId, id);
      s.activeBySpace[loc.list === 'favorites' ? s.activeSpaceId : spaceId] = next;
    }
    return;
  }
  if (it.kind === 'folder') return; // folders are deleted, not closed

  const next = wasActive ? neighborAfterRemoval(s, spaceId, id) : undefined;
  detach(s, id);
  s.closed.unshift({ item: JSON.parse(JSON.stringify(it)), spaceId, list: loc.list, parentId: loc.parentId ?? undefined, index: loc.index });
  // keep split pane tabs with the split record
  if (it.kind === 'split') {
    const panes = it.panes.map((p) => s.items[p]).filter(Boolean);
    (s.closed[0] as { panes?: Item[] }).panes = JSON.parse(JSON.stringify(panes));
  }
  if (s.closed.length > MAX_CLOSED) s.closed.length = MAX_CLOSED;
  purge(s, id);
  if (wasActive) s.activeBySpace[spaceId] = next ?? null;
}

/** Bring back the most recently closed item. Returns its id. */
export function reopenClosed(s: AppState, now: number): ID | null {
  const rec = s.closed.shift() as (AppState['closed'][number] & { panes?: Item[] }) | undefined;
  if (!rec) return null;
  const it = rec.item;
  s.items[it.id] = it;
  for (const p of rec.panes ?? []) s.items[p.id] = p;
  const spaceOk = s.spaces.some((x) => x.id === rec.spaceId);
  const spaceId = spaceOk ? rec.spaceId : s.activeSpaceId;
  const parentOk = rec.parentId && s.items[rec.parentId]?.kind === 'folder';
  try {
    attach(s, it.id, { list: rec.list, spaceId: rec.list === 'favorites' ? null : spaceId, parentId: parentOk ? rec.parentId! : null, index: rec.index });
  } catch {
    attach(s, it.id, { list: 'today', spaceId, parentId: null, index: 0 });
  }
  s.activeSpaceId = spaceId;
  select(s, it.id, now);
  return it.id;
}

/** Go back to a pinned/favorite tab's home URL. */
export function resetToHome(s: AppState, id: ID): void {
  const t = s.items[id];
  if (t?.kind === 'tab' && t.homeUrl) t.url = t.homeUrl;
}

/** Duplicate a tab into Today. */
export function duplicateTab(s: AppState, id: ID, now: number): ID | null {
  const t = s.items[id];
  if (!t || t.kind !== 'tab') return null;
  return newTab(s, { url: t.url, title: t.title, now });
}

/** Move selection up/down the visible order (ctrl+tab). */
export function cycleTab(s: AppState, dir: 1 | -1, now: number): void {
  const order = flatVisible(s, s.activeSpaceId, true);
  if (order.length === 0) return;
  const cur = activeItemId(s);
  const i = cur ? order.indexOf(cur) : -1;
  const next = order[(i + dir + order.length) % order.length];
  select(s, next, now);
}

/** ⌘1…⌘9: 9 always means the last one. */
export function selectNth(s: AppState, n: number, now: number): void {
  const order = flatVisible(s, s.activeSpaceId, true);
  const id = n >= 9 ? order[order.length - 1] : order[n - 1];
  if (id) select(s, id, now);
}

/** Remove a pane from a split view; with one pane left the split turns back into a normal tab. */
export function removeFromSplit(s: AppState, splitId: ID, tabId: ID, now: number): void {
  const sp = s.items[splitId];
  if (!sp || sp.kind !== 'split') return;
  const i = sp.panes.indexOf(tabId);
  if (i < 0) return;
  sp.panes.splice(i, 1);
  const removed = sp.sizes.splice(i, 1)[0] ?? 0;
  const total = sp.sizes.reduce((a, b) => a + b, 0) || 1;
  sp.sizes = sp.sizes.map((x) => x + (removed * x) / total);
  delete s.items[tabId];
  sp.focused = Math.min(sp.focused, sp.panes.length - 1);
  if (sp.panes.length === 1) unsplit(s, splitId, now);
}

/** Turn a split back into separate tabs placed where the split was. */
export function unsplit(s: AppState, splitId: ID, now: number): ID[] {
  const sp = s.items[splitId];
  if (!sp || sp.kind !== 'split') return [];
  const loc = locate(s, splitId);
  const panes = [...sp.panes];
  const wasActive = s.activeBySpace[s.activeSpaceId] === splitId;
  const focusedTab = panes[sp.focused] ?? panes[0];
  if (loc) {
    const arr = listAt(s, loc.list, loc.spaceId, loc.parentId);
    arr.splice(loc.index, 1, ...panes);
  }
  delete s.items[splitId];
  if (wasActive && focusedTab) select(s, focusedTab, now);
  return panes;
}

export function ensureActiveSpaceValid(s: AppState): void {
  if (!s.spaces.some((x) => x.id === s.activeSpaceId)) s.activeSpaceId = s.spaces[0].id;
  for (const sp of s.spaces) if (!(sp.id in s.activeBySpace)) s.activeBySpace[sp.id] = null;
}

export function toggleFolder(s: AppState, id: ID, collapsed?: boolean): void {
  const f = s.items[id];
  if (f?.kind === 'folder') f.collapsed = collapsed ?? !f.collapsed;
}

// ---- Pinned + Favorites -------------------------------------------------------

/** Pin an item: it moves to the bottom of Pinned and remembers its current page. */
export function pinItem(s: AppState, id: ID, tidy = s.settings.tidyTitles): boolean {
  const it = s.items[id];
  if (!it || it.kind === 'folder') return false;
  const loc = locate(s, id);
  if (!loc || loc.list === 'pinned') return false;
  const spaceId = loc.spaceId ?? s.activeSpaceId;
  detach(s, id);
  const sp = s.spaces.find((x) => x.id === spaceId)!;
  sp.pinned.push(id);
  if (it.kind === 'tab') {
    it.homeUrl = it.url;
    if (tidy && !it.customTitle) {
      const t = tidyTitle(it.title, it.url);
      if (t && t !== it.title) it.customTitle = t;
    }
  }
  return true;
}

/** Unpin: back to the top of Today. The tab forgets its home page. */
export function unpinItem(s: AppState, id: ID): boolean {
  const it = s.items[id];
  if (!it || it.kind === 'folder') return false;
  const loc = locate(s, id);
  if (!loc || loc.list === 'today') return false;
  const spaceId = loc.spaceId ?? s.activeSpaceId;
  detach(s, id);
  attach(s, id, { list: 'today', spaceId, parentId: null, index: 0 });
  if (it.kind === 'tab') it.homeUrl = undefined;
  return true;
}

export function togglePin(s: AppState, id: ID): boolean {
  const loc = locate(s, id);
  if (!loc) return false;
  return loc.list === 'today' ? pinItem(s, id) : unpinItem(s, id);
}

/** Favorites are tabs only and are shared by every Space. */
export function addFavorite(s: AppState, id: ID, index?: number): boolean {
  const it = s.items[id];
  if (!it || it.kind !== 'tab') return false;
  const loc = locate(s, id);
  if (!loc || loc.list === 'favorites') return false;
  detach(s, id);
  attach(s, id, { list: 'favorites', spaceId: null, parentId: null, index: index ?? s.favorites.length });
  it.homeUrl = it.url;
  return true;
}

/** Take a tab out of Favorites; it lands in the current Space (Pinned or Today). */
export function removeFavorite(s: AppState, id: ID, to: 'today' | 'pinned' = 'today'): boolean {
  const it = s.items[id];
  if (!it || it.kind !== 'tab' || !s.favorites.includes(id)) return false;
  detach(s, id);
  const sp = s.spaces.find((x) => x.id === s.activeSpaceId)!;
  if (to === 'pinned') sp.pinned.push(id);
  else {
    sp.today.unshift(id);
    it.homeUrl = undefined;
  }
  return true;
}

/** Make the page a pinned/favorite tab is showing its new home. */
export function setHomeHere(s: AppState, id: ID): void {
  const t = s.items[id];
  if (t?.kind === 'tab' && t.homeUrl) t.homeUrl = t.url;
}

export function isPinnedOrFavorite(s: AppState, id: ID): boolean {
  const loc = locate(s, id);
  return !!loc && loc.list !== 'today';
}

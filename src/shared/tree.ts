// Helpers for the sidebar tree. A Space has two top-level lists (pinned, today),
// folders hold children, and Favorites is one flat global list.
// All functions mutate the state they are given (used inside immer drafts).

import type { AppState, FolderItem, ID, Item, ListName, Location, SplitItem } from './types';

export function getSpace(s: AppState, spaceId: ID) {
  const sp = s.spaces.find((x) => x.id === spaceId);
  if (!sp) throw new Error(`Unknown space ${spaceId}`);
  return sp;
}

export function activeSpace(s: AppState) {
  return s.spaces.find((x) => x.id === s.activeSpaceId) ?? s.spaces[0];
}

/** The live array that holds items at this location. */
export function listAt(s: AppState, list: ListName, spaceId: ID | null, parentId: ID | null): ID[] {
  if (parentId) {
    const f = s.items[parentId];
    if (!f || f.kind !== 'folder') throw new Error(`Not a folder: ${parentId}`);
    return f.children;
  }
  if (list === 'favorites') return s.favorites;
  if (!spaceId) throw new Error('spaceId required');
  return getSpace(s, spaceId)[list];
}

function search(s: AppState, arr: ID[], id: ID, base: Omit<Location, 'index' | 'parentId'>, parentId: ID | null): Location | null {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === id) return { ...base, parentId, index: i };
    const it = s.items[arr[i]];
    if (it && it.kind === 'folder') {
      const found = search(s, it.children, id, base, it.id);
      if (found) return found;
    }
  }
  return null;
}

/** Where an item sits in the sidebar, or null (e.g. a tab inside a split view). */
export function locate(s: AppState, id: ID): Location | null {
  const fav = s.favorites.indexOf(id);
  if (fav >= 0) return { list: 'favorites', spaceId: null, parentId: null, index: fav };
  for (const sp of s.spaces) {
    for (const list of ['pinned', 'today'] as const) {
      const r = search(s, sp[list], id, { list, spaceId: sp.id }, null);
      if (r) return r;
    }
  }
  return null;
}

/** The split view that owns this tab, if any. */
export function ownerSplit(s: AppState, tabId: ID): SplitItem | null {
  for (const it of Object.values(s.items)) {
    if (it.kind === 'split' && it.panes.includes(tabId)) return it;
  }
  return null;
}

/** Remove an item from wherever it is in the tree. Returns where it was. */
export function detach(s: AppState, id: ID): Location | null {
  const loc = locate(s, id);
  if (!loc) return null;
  listAt(s, loc.list, loc.spaceId, loc.parentId).splice(loc.index, 1);
  return loc;
}

export function attach(s: AppState, id: ID, loc: Location): void {
  const arr = listAt(s, loc.list, loc.spaceId, loc.parentId);
  const i = Math.max(0, Math.min(loc.index, arr.length));
  arr.splice(i, 0, id);
}

/** All ids under an item (folder children, split panes), not including the item. */
export function descendants(s: AppState, id: ID): ID[] {
  const it = s.items[id];
  if (!it) return [];
  if (it.kind === 'folder') return it.children.flatMap((c) => [c, ...descendants(s, c)]);
  if (it.kind === 'split') return [...it.panes];
  return [];
}

/** Can this item be dropped at this location? */
export function canPlace(s: AppState, id: ID, to: Pick<Location, 'list' | 'parentId'>): boolean {
  const it = s.items[id];
  if (!it) return false;
  if (to.list === 'favorites') return it.kind === 'tab' && to.parentId === null;
  if (it.kind === 'folder' && to.list === 'today') return false; // folders live in Pinned
  if (to.parentId) {
    if (to.parentId === id) return false;
    if (descendants(s, id).includes(to.parentId)) return false;
    const parentLoc = locate(s, to.parentId);
    if (!parentLoc || parentLoc.list !== 'pinned') return false;
  }
  return true;
}

/** Move an item; index is in terms of the destination list after removal. */
export function moveTo(s: AppState, id: ID, to: Location): boolean {
  if (!canPlace(s, id, to)) return false;
  const from = detach(s, id);
  if (!from) return false;
  attach(s, id, to);
  return true;
}

/** Remove the item and everything inside it from the items map. */
export function purge(s: AppState, id: ID): Item[] {
  const all = [id, ...descendants(s, id)];
  const removed: Item[] = [];
  for (const x of all) {
    if (s.items[x]) removed.push(s.items[x]);
    delete s.items[x];
  }
  return removed;
}

/** Top-level-to-leaf order of everything visible in a Space (for ⌘1…⌘9 and next/prev tab). */
export function flatVisible(s: AppState, spaceId: ID, includeFavorites: boolean): ID[] {
  const sp = getSpace(s, spaceId);
  const out: ID[] = includeFavorites ? [...s.favorites] : [];
  const walk = (ids: ID[]) => {
    for (const id of ids) {
      const it = s.items[id];
      if (!it) continue;
      if (it.kind === 'folder') {
        if (!it.collapsed) walk(it.children);
      } else out.push(id);
    }
  };
  walk(sp.pinned);
  walk(sp.today);
  return out;
}

export function folderOf(s: AppState, id: ID): FolderItem | null {
  const loc = locate(s, id);
  if (!loc?.parentId) return null;
  return s.items[loc.parentId] as FolderItem;
}

/** Every tab/note id inside a list (deep), used by archiving and cleanup. */
export function deepIds(s: AppState, ids: ID[]): ID[] {
  return ids.flatMap((id) => [id, ...descendants(s, id)]);
}

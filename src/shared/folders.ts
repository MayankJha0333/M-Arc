// Folders and drag-and-drop moves in the sidebar.

import { newId } from './ids';
import type { AppState, ID, Location } from './types';
import { attach, canPlace, detach, getSpace, listAt, locate } from './tree';
import { archiveItem } from './archive';

export interface NewFolderOpts {
  spaceId?: ID;
  title?: string;
  parentId?: ID | null;
  /** Items to put inside straight away (e.g. a multi-selection). */
  items?: ID[];
  now: number;
}

/** Create a folder at the bottom of Pinned (or inside another folder). */
export function createFolder(s: AppState, o: NewFolderOpts): ID {
  const id = newId('folder');
  s.items[id] = { id, kind: 'folder', title: o.title?.trim() || 'New Folder', children: [], collapsed: false, createdAt: o.now };
  const spaceId = o.spaceId ?? s.activeSpaceId;
  const parentId = o.parentId ?? null;
  const list = parentId ? listAt(s, 'pinned', spaceId, parentId) : getSpace(s, spaceId).pinned;
  attach(s, id, { list: 'pinned', spaceId, parentId, index: list.length });
  for (const item of o.items ?? []) {
    const it = s.items[item];
    if (!it || item === id) continue;
    if (!canPlace(s, item, { list: 'pinned', parentId: id })) continue;
    detach(s, item);
    (s.items[id] as { children: ID[] }).children.push(item);
    if (it.kind === 'tab' && !it.homeUrl) it.homeUrl = it.url;
  }
  return id;
}

/** Delete a folder. Its contents are archived (so nothing is lost). */
export function deleteFolder(s: AppState, id: ID, now: number): number {
  const f = s.items[id];
  if (!f || f.kind !== 'folder') return 0;
  return archiveItem(s, id, now, 'manual');
}

/** Remove the folder but keep its contents where the folder was. */
export function ungroupFolder(s: AppState, id: ID): void {
  const f = s.items[id];
  if (!f || f.kind !== 'folder') return;
  const loc = locate(s, id);
  if (!loc) return;
  const arr = listAt(s, loc.list, loc.spaceId, loc.parentId);
  arr.splice(loc.index, 1, ...f.children);
  delete s.items[id];
}

export function setAllFolders(s: AppState, spaceId: ID, collapsed: boolean): void {
  const walk = (ids: ID[]) => {
    for (const x of ids) {
      const it = s.items[x];
      if (it?.kind === 'folder') {
        it.collapsed = collapsed;
        walk(it.children);
      }
    }
  };
  walk(getSpace(s, spaceId).pinned);
}

export type DropTarget =
  | { type: 'before' | 'after'; id: ID }
  | { type: 'into'; folderId: ID }
  | { type: 'end'; list: 'pinned' | 'today' | 'favorites'; spaceId: ID | null }
  | { type: 'space'; spaceId: ID };

/** Where would this drop put the item? null if it isn't allowed. */
export function resolveDrop(s: AppState, id: ID, target: DropTarget): Omit<Location, 'index'> & { index: number | 'end' } | null {
  if (target.type === 'before' || target.type === 'after') {
    if (target.id === id) return null;
    const loc = locate(s, target.id);
    if (!loc) return null;
    return { list: loc.list, spaceId: loc.spaceId, parentId: loc.parentId, index: loc.index + (target.type === 'after' ? 1 : 0) };
  }
  if (target.type === 'into') {
    if (target.folderId === id) return null;
    const loc = locate(s, target.folderId);
    if (!loc) return null;
    return { list: 'pinned', spaceId: loc.spaceId, parentId: target.folderId, index: 'end' };
  }
  if (target.type === 'end') {
    return { list: target.list, spaceId: target.list === 'favorites' ? null : target.spaceId ?? s.activeSpaceId, parentId: null, index: 'end' };
  }
  // Dropped on another Space: same section there (Favorites go to Pinned).
  const from = locate(s, id);
  const list = !from || from.list === 'favorites' ? 'pinned' : from.list;
  const spaceId = (target as Extract<DropTarget, { type: 'space' }>).spaceId;
  return { list, spaceId, parentId: null, index: list === 'today' ? 0 : 'end' };
}

/** Move an item to where it was dropped. Returns false if the drop isn't allowed. */
export function dropItem(s: AppState, id: ID, target: DropTarget): boolean {
  const it = s.items[id];
  const where = resolveDrop(s, id, target);
  if (!it || !where) return false;
  if (!canPlace(s, id, where)) return false;
  const from = locate(s, id);
  if (!from) return false;
  // Removing the item first shifts later siblings up by one.
  const sameList = from.list === where.list && from.spaceId === where.spaceId && from.parentId === where.parentId;
  detach(s, id);
  let index = where.index === 'end' ? listAt(s, where.list, where.spaceId, where.parentId).length : where.index;
  if (sameList && where.index !== 'end' && from.index < where.index) index -= 1;
  attach(s, id, { list: where.list, spaceId: where.spaceId, parentId: where.parentId, index });
  if (it.kind === 'tab') {
    if (where.list === 'today') it.homeUrl = undefined;
    else if (!it.homeUrl) it.homeUrl = it.url;
  }
  return true;
}

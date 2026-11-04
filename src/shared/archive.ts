// The Archive: where tabs go when they're cleared, deleted with a folder,
// or auto-archived after not being used for a while.

import { newId } from './ids';
import type { AppState, ArchiveEntry, ID, Item } from './types';
import { attach, descendants, detach, locate } from './tree';
import { newTab } from './ops';

const MAX_ARCHIVE = 2000;

function entriesFor(it: Item, spaceId: ID, now: number, reason: ArchiveEntry['reason'], s: AppState): ArchiveEntry[] {
  if (it.kind === 'tab') {
    return [{ id: newId('arc'), title: it.customTitle || it.title, url: it.url, kind: 'tab', spaceId, archivedAt: now, reason }];
  }
  if (it.kind === 'note') {
    return [{ id: newId('arc'), title: it.title, url: '', html: it.html, kind: 'note', spaceId, archivedAt: now, reason }];
  }
  if (it.kind === 'split') {
    return it.panes.flatMap((p) => (s.items[p] ? entriesFor(s.items[p], spaceId, now, reason, s) : []));
  }
  return it.children.flatMap((c) => (s.items[c] ? entriesFor(s.items[c], spaceId, now, reason, s) : []));
}

/** Move an item (and anything inside it) into the Archive. */
export function archiveItem(s: AppState, id: ID, now: number, reason: ArchiveEntry['reason'] = 'manual'): number {
  const it = s.items[id];
  if (!it) return 0;
  const loc = locate(s, id);
  const spaceId = loc?.spaceId ?? s.activeSpaceId;
  const entries = entriesFor(it, spaceId, now, reason, s);
  s.archive.unshift(...entries);
  if (s.archive.length > MAX_ARCHIVE) s.archive.length = MAX_ARCHIVE;
  if (loc) detach(s, id);
  for (const x of [id, ...descendants(s, id)]) delete s.items[x];
  for (const [sp, active] of Object.entries(s.activeBySpace)) {
    if (active && !s.items[active]) s.activeBySpace[sp] = null;
  }
  return entries.length;
}

/** "Clear": archive every Today item in a Space. */
export function clearToday(s: AppState, spaceId: ID, now: number): number {
  const sp = s.spaces.find((x) => x.id === spaceId);
  if (!sp) return 0;
  let n = 0;
  for (const id of [...sp.today]) n += archiveItem(s, id, now, 'cleared');
  return n;
}

/** Bring an archived page back as a tab (or note) at the top of Today. */
export function restoreArchived(s: AppState, entryId: ID, now: number): ID | null {
  const i = s.archive.findIndex((e) => e.id === entryId);
  if (i < 0) return null;
  const e = s.archive[i];
  s.archive.splice(i, 1);
  const spaceId = s.spaces.some((x) => x.id === e.spaceId) ? e.spaceId : s.activeSpaceId;
  if (e.kind === 'note') {
    const id = newId('note');
    s.items[id] = { id, kind: 'note', title: e.title, html: e.html ?? '', createdAt: now, updatedAt: now, lastActiveAt: now };
    attach(s, id, { list: 'today', spaceId, parentId: null, index: 0 });
    s.activeSpaceId = spaceId;
    s.activeBySpace[spaceId] = id;
    return id;
  }
  return newTab(s, { url: e.url, title: e.title, spaceId, now });
}

export function deleteArchived(s: AppState, entryId: ID): void {
  s.archive = s.archive.filter((e) => e.id !== entryId);
}

export function clearArchive(s: AppState): void {
  s.archive = [];
}

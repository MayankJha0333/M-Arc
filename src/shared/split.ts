// Split View: 2–4 pages side by side in one sidebar item.

import { newId } from './ids';
import type { AppState, ID, SplitItem, SplitOrientation } from './types';
import { attach, detach, locate, ownerSplit } from './tree';
import { newTab, select, unsplit } from './ops';

export const MAX_PANES = 4;
export const MIN_PANE = 0.12;

function even(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

/** Combine tabs into a split view placed where the first tab was. */
export function createSplit(s: AppState, tabIds: ID[], now: number, orientation: SplitOrientation = 'row'): ID | null {
  const ids = Array.from(new Set(tabIds)).filter((id) => s.items[id]?.kind === 'tab' && !ownerSplit(s, id));
  if (ids.length < 2) return null;
  const panes = ids.slice(0, MAX_PANES);
  const first = locate(s, panes[0]);
  if (!first) return null;
  const list = first.list === 'favorites' ? 'today' : first.list;
  const spaceId = first.spaceId ?? s.activeSpaceId;
  const parentId = first.list === 'favorites' ? null : first.parentId;
  for (const p of panes) detach(s, p);
  const id = newId('split');
  const split: SplitItem = { id, kind: 'split', panes, orientation, sizes: even(panes.length), focused: panes.length - 1, createdAt: now, lastActiveAt: now };
  s.items[id] = split;
  attach(s, id, { list, spaceId, parentId, index: first.list === 'favorites' ? 0 : first.index });
  return id;
}

/** Add a tab to an existing split (taking it out of the sidebar). */
export function addToSplit(s: AppState, splitId: ID, tabId: ID, index?: number): boolean {
  const sp = s.items[splitId];
  const t = s.items[tabId];
  if (!sp || sp.kind !== 'split' || !t || t.kind !== 'tab') return false;
  if (sp.panes.length >= MAX_PANES || sp.panes.includes(tabId) || ownerSplit(s, tabId)) return false;
  detach(s, tabId);
  const i = Math.max(0, Math.min(index ?? sp.panes.length, sp.panes.length));
  sp.panes.splice(i, 0, tabId);
  sp.sizes = even(sp.panes.length);
  sp.focused = i;
  return true;
}

/**
 * Open a URL next to whatever is showing. A single tab becomes a split;
 * an existing split gets another pane. Returns the new tab id.
 */
export function openInSplit(s: AppState, url: string, now: number): ID | null {
  const activeId = s.activeBySpace[s.activeSpaceId];
  const active = activeId ? s.items[activeId] : null;
  if (active?.kind === 'split' && active.panes.length >= MAX_PANES) return null;
  const tabId = newTab(s, { url, now, activate: false });
  if (active?.kind === 'tab') {
    const id = createSplit(s, [active.id, tabId], now);
    if (id) select(s, tabId, now);
    return tabId;
  }
  if (active?.kind === 'split') {
    addToSplit(s, active.id, tabId);
    select(s, tabId, now);
    return tabId;
  }
  select(s, tabId, now);
  return tabId;
}

/** Drop a sidebar tab onto the page area: combine it with what's showing. */
export function splitWith(s: AppState, tabId: ID, now: number): ID | null {
  const activeId = s.activeBySpace[s.activeSpaceId];
  if (!activeId || activeId === tabId) return null;
  const active = s.items[activeId];
  if (active?.kind === 'tab') {
    const id = createSplit(s, [activeId, tabId], now);
    if (id) select(s, tabId, now);
    return id;
  }
  if (active?.kind === 'split' && addToSplit(s, active.id, tabId)) {
    select(s, tabId, now);
    return active.id;
  }
  return null;
}

export function setOrientation(s: AppState, splitId: ID, o: SplitOrientation): void {
  const sp = s.items[splitId];
  if (sp?.kind === 'split') sp.orientation = o;
}

/** Resize: move the divider between pane i and i+1 to `at` (0–1 across the whole split). */
export function moveDivider(s: AppState, splitId: ID, i: number, at: number): void {
  const sp = s.items[splitId];
  if (sp?.kind !== 'split' || i < 0 || i >= sp.panes.length - 1) return;
  const start = sp.sizes.slice(0, i).reduce((a, b) => a + b, 0);
  const pair = sp.sizes[i] + sp.sizes[i + 1];
  const left = Math.max(MIN_PANE, Math.min(pair - MIN_PANE, at - start));
  sp.sizes[i] = left;
  sp.sizes[i + 1] = pair - left;
}

export function resetSizes(s: AppState, splitId: ID): void {
  const sp = s.items[splitId];
  if (sp?.kind === 'split') sp.sizes = even(sp.panes.length);
}

/** Take one pane out of the split and put it back in the sidebar as its own tab. */
export function separatePane(s: AppState, splitId: ID, tabId: ID, now: number): void {
  const sp = s.items[splitId];
  if (sp?.kind !== 'split' || !sp.panes.includes(tabId)) return;
  if (sp.panes.length <= 2) {
    unsplit(s, splitId, now);
    return;
  }
  const loc = locate(s, splitId);
  const i = sp.panes.indexOf(tabId);
  sp.panes.splice(i, 1);
  sp.sizes = even(sp.panes.length);
  sp.focused = Math.min(sp.focused, sp.panes.length - 1);
  attach(s, tabId, { list: loc?.list === 'pinned' ? 'pinned' : 'today', spaceId: loc?.spaceId ?? s.activeSpaceId, parentId: loc?.parentId ?? null, index: loc ? loc.index + 1 : 0 });
}

/** Move a pane to another position inside the split. */
export function movePane(s: AppState, splitId: ID, from: number, to: number): void {
  const sp = s.items[splitId];
  if (sp?.kind !== 'split') return;
  const [p] = sp.panes.splice(from, 1);
  const [z] = sp.sizes.splice(from, 1);
  sp.panes.splice(to, 0, p);
  sp.sizes.splice(to, 0, z);
  sp.focused = to;
}

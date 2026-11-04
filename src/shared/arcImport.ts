// Import Spaces and tabs from Arc's StorableSidebar.json.
//
// Field names below were confirmed inside Arc 1.171.0 (see RESEARCH.md §2a).
// How they nest was not visible in the app, so this reader is deliberately
// forgiving: it accepts both known layouts and skips anything it doesn't understand.

import { newId } from './ids';
import { defaultTheme, makeSpace } from './defaults';
import type { AppState, ID, Item, SpaceTheme } from './types';
import { tidyTitle } from './url';
import { MAX_PANES } from './split';

type Json = Record<string, unknown>;

export interface ArcNode {
  kind: 'tab' | 'folder' | 'split' | 'note';
  title: string;
  url?: string;
  children?: ArcNode[];
  orientation?: 'row' | 'column';
}

export interface ArcSpace {
  arcId: string;
  name: string;
  icon: string;
  colors: [string, string] | null;
  pinned: ArcNode[];
  today: ArcNode[];
}

export interface ArcData {
  spaces: ArcSpace[];
  favorites: ArcNode[];
  skipped: { reason: string; title: string }[];
}

const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Arc stores lists as [id, object, id, object…]; objects may be wrapped in {value: …}. */
function pairs(list: unknown): Json[] {
  if (!Array.isArray(list)) return [];
  const out: Json[] = [];
  for (const x of list) {
    if (!isObj(x)) continue;
    const v = isObj(x.value) ? x.value : x;
    if (typeof v.id === 'string') out.push(v);
  }
  return out;
}

function toHex(c: Json): string | null {
  const ch = ['red', 'green', 'blue'].map((k) => c[k]);
  if (!ch.every((v) => typeof v === 'number')) return null;
  return `#${(ch as number[]).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Find the first two distinct colors anywhere inside Arc's theme object. */
export function extractColors(theme: unknown): [string, string] | null {
  const found: string[] = [];
  const walk = (x: unknown, depth: number) => {
    if (found.length >= 2 || depth > 12) return;
    if (Array.isArray(x)) return x.forEach((y) => walk(y, depth + 1));
    if (!isObj(x)) return;
    const hex = toHex(x);
    if (hex) {
      if (!found.includes(hex)) found.push(hex);
      return;
    }
    Object.values(x).forEach((y) => walk(y, depth + 1));
  };
  walk(theme, 0);
  if (found.length === 0) return null;
  return [found[0], found[1] ?? found[0]];
}

function iconOf(space: Json): string {
  const info = isObj(space.customInfo) ? space.customInfo : {};
  const t = isObj(info.iconType) ? info.iconType : {};
  const e = t.emoji_v2 ?? t.emoji;
  return typeof e === 'string' && e.trim() ? [...e.trim()].slice(0, 2).join('') : '✦';
}

const SAFE_URL = /^(https?|file):/i;

/** Read Arc's JSON into a simple, Kite-friendly structure. Throws only if it isn't Arc data at all. */
export function parseArc(text: string): ArcData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (!isObj(raw)) throw new Error('That doesn’t look like Arc’s StorableSidebar.json.');

  // Layout A: { sidebar: { containers: [ {global}, { spaces, items, topAppsContainerIDs } ] } }
  // Layout B: { sidebarSyncState: { items, spaceModels, container: { value: {...} } } }
  let spacesRaw: Json[] = [];
  let itemsRaw: Json[] = [];
  let topApps: unknown[] = [];
  const sidebar = isObj(raw.sidebar) ? raw.sidebar : null;
  const containers = sidebar && Array.isArray(sidebar.containers) ? sidebar.containers : [];
  const main = containers.find((c) => isObj(c) && Array.isArray((c as Json).spaces)) as Json | undefined;
  if (main) {
    spacesRaw = pairs(main.spaces);
    itemsRaw = pairs(main.items);
    topApps = Array.isArray(main.topAppsContainerIDs) ? main.topAppsContainerIDs : [];
  } else if (isObj(raw.sidebarSyncState)) {
    const sync = raw.sidebarSyncState;
    spacesRaw = pairs(sync.spaceModels);
    itemsRaw = pairs(sync.items);
    const cont = isObj(sync.container) && isObj(sync.container.value) ? sync.container.value : {};
    topApps = Array.isArray(cont.topAppsContainerIDs) ? cont.topAppsContainerIDs : [];
  }
  if (spacesRaw.length === 0 && itemsRaw.length === 0) throw new Error('No Spaces or tabs found. Is this Arc’s StorableSidebar.json?');

  const byId = new Map(itemsRaw.map((it) => [it.id as string, it]));
  const skipped: ArcData['skipped'] = [];
  const seen = new Set<string>();

  const node = (id: string): ArcNode | null => {
    const it = byId.get(id);
    if (!it || seen.has(id)) return null;
    seen.add(id);
    const data = isObj(it.data) ? it.data : {};
    const title = typeof it.title === 'string' ? it.title : '';
    const kids = () => (Array.isArray(it.childrenIds) ? (it.childrenIds as unknown[]) : []).filter((c): c is string => typeof c === 'string').map(node).filter((n): n is ArcNode => !!n);
    if (isObj(data.tab)) {
      const url = typeof data.tab.savedURL === 'string' ? data.tab.savedURL : '';
      const saved = typeof data.tab.savedTitle === 'string' ? data.tab.savedTitle : '';
      if (!SAFE_URL.test(url)) {
        skipped.push({ reason: 'unsupported link', title: title || saved || url });
        return null;
      }
      return { kind: 'tab', title: title || saved || url, url };
    }
    if (isObj(data.list)) return { kind: 'folder', title: title || 'Folder', children: kids() };
    if (isObj(data.splitView)) {
      const children = kids().filter((k) => k.kind === 'tab');
      const o = isObj(data.splitView) && /vertical/i.test(String(data.splitView.layoutOrientation ?? '')) ? 'column' : 'row';
      return children.length ? { kind: 'split', title: title || 'Split view', children, orientation: o } : null;
    }
    if (isObj(data.arcDocument)) return { kind: 'note', title: title || 'Arc note' };
    if (isObj(data.easel)) {
      skipped.push({ reason: 'Easel (not supported)', title: title || 'Easel' });
      return null;
    }
    // Unknown item types: keep their children if they have any.
    const k = kids();
    if (k.length) return { kind: 'folder', title: title || 'Folder', children: k };
    skipped.push({ reason: 'unknown item', title: title || id });
    return null;
  };

  const childrenOf = (containerId: string | undefined): ArcNode[] => {
    if (!containerId) return [];
    const c = byId.get(containerId);
    if (!c) return [];
    seen.add(containerId);
    return (Array.isArray(c.childrenIds) ? (c.childrenIds as unknown[]) : []).filter((x): x is string => typeof x === 'string').map(node).filter((n): n is ArcNode => !!n);
  };

  const spaces: ArcSpace[] = spacesRaw.map((sp, i) => {
    const ids = Array.isArray(sp.containerIDs) ? sp.containerIDs : [];
    const after = (label: string) => {
      const j = ids.indexOf(label);
      return j >= 0 && typeof ids[j + 1] === 'string' ? (ids[j + 1] as string) : undefined;
    };
    const info = isObj(sp.customInfo) ? sp.customInfo : {};
    return {
      arcId: sp.id as string,
      name: (typeof sp.title === 'string' && sp.title.trim()) || `Arc Space ${i + 1}`,
      icon: iconOf(sp),
      colors: extractColors(info.windowTheme),
      pinned: childrenOf(after('pinned')),
      today: childrenOf(after('unpinned')),
    };
  });

  // Favorites: the first container listed in topAppsContainerIDs (the default profile's).
  const favContainer = topApps.find((x): x is string => typeof x === 'string');
  const favorites = childrenOf(favContainer).flatMap((n) => (n.kind === 'tab' ? [n] : n.children?.filter((c) => c.kind === 'tab') ?? []));

  return { spaces, favorites, skipped };
}

export interface ImportOptions {
  /** Arc space ids to import (default: all). */
  spaceIds?: string[];
  includeFavorites?: boolean;
  tidy?: boolean;
  now: number;
}

export interface ImportSummary {
  spaces: number;
  tabs: number;
  folders: number;
  notes: number;
  splits: number;
  favorites: number;
  skipped: number;
  firstSpaceId: ID | null;
}

/** Add Arc's Spaces and tabs to Kite (never replaces what's already there). */
export function importArc(s: AppState, data: ArcData, o: ImportOptions): ImportSummary {
  const sum: ImportSummary = { spaces: 0, tabs: 0, folders: 0, notes: 0, splits: 0, favorites: 0, skipped: data.skipped.length, firstSpaceId: null };
  const make = (n: ArcNode, list: 'pinned' | 'today' | 'favorites'): ID | null => {
    const id = newId(n.kind);
    let it: Item;
    // Imported items start "fresh": Arc's last-used times would trigger auto-archive at once.
    if (n.kind === 'tab') {
      const pinnedLike = list !== 'today';
      const custom = o.tidy && pinnedLike ? tidyTitle(n.title, n.url!) : undefined;
      it = { id, kind: 'tab', url: n.url!, title: n.title, createdAt: o.now, lastActiveAt: o.now, homeUrl: pinnedLike ? n.url : undefined, customTitle: custom && custom !== n.title ? custom : undefined };
      sum.tabs++;
    } else if (n.kind === 'note') {
      it = { id, kind: 'note', title: n.title, html: '<p><em>Imported from Arc. Arc keeps note text in a separate encrypted store, so only the title came across.</em></p>', createdAt: o.now, updatedAt: o.now, lastActiveAt: o.now };
      sum.notes++;
    } else if (n.kind === 'split') {
      const panes = (n.children ?? []).slice(0, MAX_PANES).map((c) => make(c, list)).filter((x): x is ID => !!x);
      if (panes.length < 2) return panes[0] ?? null;
      it = { id, kind: 'split', panes, orientation: n.orientation ?? 'row', sizes: panes.map(() => 1 / panes.length), focused: 0, createdAt: o.now, lastActiveAt: o.now };
      sum.splits++;
    } else {
      const children = (n.children ?? []).map((c) => make(c, 'pinned')).filter((x): x is ID => !!x);
      it = { id, kind: 'folder', title: n.title, children, collapsed: false, createdAt: o.now };
      sum.folders++;
    }
    s.items[id] = it;
    return id;
  };

  const wanted = o.spaceIds ? new Set(o.spaceIds) : null;
  data.spaces.forEach((as, i) => {
    if (wanted && !wanted.has(as.arcId)) return;
    const sp = makeSpace(as.name, as.icon, s.spaces.length + i);
    const theme: SpaceTheme = { ...defaultTheme(s.spaces.length), ...(as.colors ? { colors: as.colors } : {}) };
    sp.theme = theme;
    sp.pinned = as.pinned.map((n) => make(n, 'pinned')).filter((x): x is ID => !!x);
    // Folders can't live in Today in Kite: their tabs are moved up instead.
    sp.today = as.today.flatMap((n) => (n.kind === 'folder' ? n.children ?? [] : [n])).map((n) => make(n, 'today')).filter((x): x is ID => !!x);
    s.spaces.push(sp);
    s.activeBySpace[sp.id] = null;
    if (!sum.firstSpaceId) sum.firstSpaceId = sp.id;
    sum.spaces++;
  });

  if (o.includeFavorites !== false) {
    const existing = new Set(s.favorites.map((id) => (s.items[id] as { url?: string }).url));
    for (const f of data.favorites) {
      if (existing.has(f.url)) continue;
      const id = make(f, 'favorites');
      if (id) {
        s.favorites.push(id);
        sum.favorites++;
        sum.tabs--; // counted as favorites instead
      }
    }
  }
  return sum;
}

/** Counts for the preview screen. */
export function countNodes(nodes: ArcNode[]): { tabs: number; folders: number; notes: number } {
  const c = { tabs: 0, folders: 0, notes: 0 };
  const walk = (ns: ArcNode[]) =>
    ns.forEach((n) => {
      if (n.kind === 'tab') c.tabs++;
      else if (n.kind === 'note') c.notes++;
      else if (n.kind === 'folder') c.folders++;
      if (n.children) walk(n.children);
    });
  walk(nodes);
  return c;
}

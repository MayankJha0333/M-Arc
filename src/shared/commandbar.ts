// What the command bar suggests for what you type.

import type { AppState, ID } from './types';
import { displayTitle } from './ops';
import { flatVisible, ownerSplit, locate } from './tree';
import { hostOf, looksLikeUrl, normalizeInput } from './url';

export interface ActionDef {
  id: string;
  title: string;
  keywords?: string;
}

/** Actions you can run by name from the command bar. */
export const ACTION_CATALOG: ActionDef[] = [
  { id: 'newNote', title: 'New Note', keywords: 'write text document' },
  { id: 'newFolder', title: 'New Folder', keywords: 'group' },
  { id: 'newSpace', title: 'New Space', keywords: 'workspace profile' },
  { id: 'newSplit', title: 'Add Split View', keywords: 'side by side pane' },
  { id: 'littleWindow', title: 'New Little Window', keywords: 'mini small popup' },
  { id: 'togglePin', title: 'Pin / Unpin Tab', keywords: 'keep' },
  { id: 'addFavorite', title: 'Add Tab to Favorites', keywords: 'favourite star' },
  { id: 'copyUrl', title: 'Copy URL', keywords: 'link clipboard' },
  { id: 'closeTab', title: 'Close Tab', keywords: 'remove' },
  { id: 'reopenClosed', title: 'Reopen Closed Tab', keywords: 'undo restore' },
  { id: 'clearToday', title: 'Clear Unpinned Tabs', keywords: 'archive tidy clean' },
  { id: 'archivePage', title: 'Open Archive', keywords: 'history old tabs' },
  { id: 'toggleSidebar', title: 'Show / Hide Sidebar', keywords: 'focus' },
  { id: 'collapseFolders', title: 'Collapse All Folders', keywords: '' },
  { id: 'expandFolders', title: 'Expand All Folders', keywords: '' },
  { id: 'settings', title: 'Open Settings', keywords: 'preferences options' },
  { id: 'shortcutsPanel', title: 'Keyboard Shortcuts', keywords: 'keys hotkeys' },
  { id: 'boostEditor', title: 'Boost This Site', keywords: 'css style customize zap' },
  { id: 'boostsPanel', title: 'Manage Boosts', keywords: 'css style' },
  { id: 'routingPanel', title: 'Link Routing', keywords: 'air traffic route rules' },
  { id: 'importArc', title: 'Import from Arc', keywords: 'migrate spaces tabs' },
  { id: 'toggleTheme', title: 'Toggle Light / Dark', keywords: 'theme appearance night' },
  { id: 'findInPage', title: 'Find in Page', keywords: 'search' },
  { id: 'reload', title: 'Reload Page', keywords: 'refresh' },
  { id: 'unsplit', title: 'Separate Split View', keywords: 'unsplit' },
];

export type Suggestion =
  | { kind: 'open'; key: string; title: string; url: string }
  | { kind: 'search'; key: string; title: string; url: string }
  | { kind: 'tab'; key: string; title: string; url: string; itemId: ID; spaceId: ID | null; spaceName: string }
  | { kind: 'note'; key: string; title: string; itemId: ID; spaceId: ID | null; spaceName: string }
  | { kind: 'history'; key: string; title: string; url: string }
  | { kind: 'action'; key: string; title: string; actionId: string }
  | { kind: 'space'; key: string; title: string; spaceId: ID; icon: string };

/** Sites that show the same title for many URLs: only one result per title+host. */
const DEDUPE_BY_TITLE: string[] = ['figma.com', 'notion.so', 'github.com', 'docs.google.com', 'maps.google.com', 'zoom.us', 'linear.app'];

/**
 * How well text matches the query, 0 = no match.
 * Prefix > start of a word > anywhere > letters in order (fuzzy).
 */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - Math.min(20, t.length / 10);
  const word = t.search(new RegExp(`(^|[\\s/._:-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  if (word >= 0) return 60 - Math.min(20, word / 4);
  const at = t.indexOf(q);
  if (at >= 0) return 40 - Math.min(20, at / 4);
  // fuzzy: every query letter appears in order
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (last >= 0) gaps += j - last - 1;
      last = j;
      i++;
    }
  }
  if (i < q.length || q.length < 2) return 0;
  if (gaps > q.length + 4) return 0; // letters too scattered to be a real match
  return Math.max(1, 20 - gaps);
}

/** Positions in `text` to highlight for the query (for bolding matched letters). */
export function matchRanges(query: string, text: string): [number, number][] {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return [];
  const at = t.indexOf(q);
  if (at >= 0) return [[at, at + q.length]];
  const out: [number, number][] = [];
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      out.push([j, j + 1]);
      i++;
    }
  }
  return i === q.length ? out : [];
}

function best(query: string, ...texts: string[]): number {
  return Math.max(0, ...texts.map((t) => matchScore(query, t)));
}

export interface SuggestOptions {
  limit?: number;
  /** Actions available right now (some depend on there being an open tab). */
  actions?: ActionDef[];
}

export function suggest(s: AppState, query: string, o: SuggestOptions = {}): Suggestion[] {
  const limit = o.limit ?? 8;
  const q = query.trim();
  const actions = o.actions ?? ACTION_CATALOG;
  const spaceName = (id: ID | null) => s.spaces.find((x) => x.id === id)?.name ?? 'Favorites';

  // Every tab you could switch to (including ones inside split views).
  const tabs: Extract<Suggestion, { kind: 'tab' }>[] = [];
  for (const it of Object.values(s.items)) {
    if (it.kind !== 'tab') continue;
    const loc = locate(s, it.id) ?? (ownerSplit(s, it.id) ? locate(s, ownerSplit(s, it.id)!.id) : null);
    if (!loc) continue;
    tabs.push({ kind: 'tab', key: `tab:${it.id}`, title: displayTitle(it), url: it.url, itemId: it.id, spaceId: loc.spaceId, spaceName: spaceName(loc.spaceId) });
  }

  if (!q) {
    // Nothing typed: recently used tabs in this Space.
    const order = flatVisible(s, s.activeSpaceId, true);
    return tabs
      .filter((t) => order.includes(t.itemId) || (ownerSplit(s, t.itemId) && order.includes(ownerSplit(s, t.itemId)!.id)))
      .sort((a, b) => (s.items[b.itemId] as { lastActiveAt: number }).lastActiveAt - (s.items[a.itemId] as { lastActiveAt: number }).lastActiveAt)
      .slice(0, 6);
  }

  const scored: { sug: Suggestion; score: number }[] = [];
  const openUrls = new Set(tabs.map((t) => t.url));
  const seenTitleHost = new Set<string>();

  for (const t of tabs) {
    const sc = best(q, t.title, hostOf(t.url), t.url);
    if (sc > 0) scored.push({ sug: t, score: sc + 12 + (t.spaceId === s.activeSpaceId ? 3 : 0) });
  }
  for (const it of Object.values(s.items)) {
    if (it.kind !== 'note') continue;
    const loc = locate(s, it.id);
    if (!loc) continue;
    const sc = best(q, it.title);
    if (sc > 0) scored.push({ sug: { kind: 'note', key: `note:${it.id}`, title: it.title, itemId: it.id, spaceId: loc.spaceId, spaceName: spaceName(loc.spaceId) }, score: sc + 12 });
  }
  for (const h of s.history.slice(0, 2000)) {
    if (openUrls.has(h.url)) continue;
    const host = hostOf(h.url);
    if (DEDUPE_BY_TITLE.some((d) => host === d || host.endsWith(`.${d}`))) {
      const key = `${h.title}|${host}`;
      if (seenTitleHost.has(key)) continue;
      seenTitleHost.add(key);
    }
    const sc = best(q, h.title, host, h.url);
    if (sc > 0) scored.push({ sug: { kind: 'history', key: `hist:${h.url}`, title: h.title || h.url, url: h.url }, score: sc + Math.min(10, Math.log2(1 + h.visits) * 2) });
  }
  for (const a of actions) {
    const sc = Math.max(best(q, a.title), best(q, a.keywords ?? '') * 0.7);
    if (sc > 0) scored.push({ sug: { kind: 'action', key: `act:${a.id}`, title: a.title, actionId: a.id }, score: sc + 2 });
  }
  for (const sp of s.spaces) {
    const sc = best(q, sp.name);
    if (sc > 0) scored.push({ sug: { kind: 'space', key: `space:${sp.id}`, title: `Go to ${sp.name}`, spaceId: sp.id, icon: sp.icon }, score: sc });
  }
  scored.sort((a, b) => b.score - a.score);

  const out: Suggestion[] = [];
  const isUrl = looksLikeUrl(q);
  const searchUrl = normalizeInput(q, s.settings.searchEngine);
  const search: Suggestion = { kind: 'search', key: 'search', title: q, url: isUrl ? normalizeInput(q.replace(/^\w+:\/\//, '').replace(/\./g, ' '), s.settings.searchEngine) : searchUrl };
  if (isUrl) out.push({ kind: 'open', key: 'open', title: q, url: normalizeInput(q, s.settings.searchEngine) });
  const strongTop = scored[0] && scored[0].score >= 70;
  if (strongTop && !isUrl) out.push(scored.shift()!.sug);
  if (!isUrl) out.push(search);
  for (const x of scored) {
    if (out.length >= limit) break;
    if (out.some((o2) => o2.key === x.sug.key)) continue;
    out.push(x.sug);
  }
  if (isUrl && out.length < limit) out.push(search);
  return out.slice(0, limit);
}

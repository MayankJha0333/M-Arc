import { sanitizeLook } from './look';
import { sanitizeShields } from './shields';
// Loading saved state safely: fill in anything missing, drop anything broken.

import { createInitialState, defaultSettings, DEFAULT_SHORTCUTS, defaultTheme, STATE_VERSION } from './defaults';
import type { AppState, ID, Item } from './types';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Turn whatever was on disk into a valid AppState. Never throws. */
export function loadState(raw: unknown): AppState {
  const base = createInitialState();
  if (!isObj(raw)) return base;
  const s = raw as Partial<AppState>;
  const state: AppState = {
    version: STATE_VERSION,
    items: isObj(s.items) ? (s.items as Record<ID, Item>) : {},
    spaces: Array.isArray(s.spaces) && s.spaces.some((x) => isObj(x) && typeof (x as { id?: unknown }).id === 'string')
      ? s.spaces.filter((x) => isObj(x) && typeof (x as { id?: unknown }).id === 'string')
      : base.spaces,
    favorites: Array.isArray(s.favorites) ? s.favorites : [],
    activeSpaceId: typeof s.activeSpaceId === 'string' ? s.activeSpaceId : base.activeSpaceId,
    activeBySpace: isObj(s.activeBySpace) ? (s.activeBySpace as AppState['activeBySpace']) : {},
    archive: Array.isArray(s.archive) ? s.archive : [],
    history: Array.isArray(s.history) ? s.history : [],
    boosts: Array.isArray(s.boosts) ? s.boosts : [],
    routes: Array.isArray(s.routes) ? s.routes : [],
    settings: { ...defaultSettings(), ...(isObj(s.settings) ? s.settings : {}) },
    closed: Array.isArray(s.closed) ? s.closed : [],
  };
  state.settings.shortcuts = { ...DEFAULT_SHORTCUTS, ...(state.settings.shortcuts ?? {}) };
  state.settings.look = sanitizeLook(state.settings.look);
  state.settings.shields = sanitizeShields(state.settings.shields);
  if (!(state.settings.soundVolume >= 0 && state.settings.soundVolume <= 1)) state.settings.soundVolume = 0.4;
  state.settings.sounds = state.settings.sounds !== false;
  if (!(state.settings.motionSpeed >= 0.5 && state.settings.motionSpeed <= 2)) state.settings.motionSpeed = 1;
  if (!['style', 'smooth', 'snappy', 'bouncy'].includes(state.settings.motionFeel)) state.settings.motionFeel = 'style';
  state.spaces = state.spaces.map((sp, i) => ({
    ...sp,
    name: sp.name || `Space ${i + 1}`,
    icon: sp.icon || '•',
    theme: { ...defaultTheme(i), ...(sp.theme ?? {}) },
    pinned: Array.isArray(sp.pinned) ? sp.pinned : [],
    today: Array.isArray(sp.today) ? sp.today : [],
    isolated: sp.isolated === true ? true : undefined,
  }));
  repair(state);
  return state;
}

/**
 * Fix broken references: ids pointing to missing items, items listed twice,
 * items that belong nowhere, and a bad active Space.
 */
export function repair(s: AppState): void {
  const seen = new Set<ID>();
  const clean = (ids: ID[], allowFolder: boolean): ID[] => {
    const out: ID[] = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const it = s.items[id];
      if (!it || typeof it !== 'object' || seen.has(id)) continue;
      if (it.kind === 'folder' && !allowFolder) continue;
      seen.add(id);
      if (it.kind === 'folder') it.children = clean(it.children, true);
      if (it.kind === 'split') {
        it.panes = (Array.isArray(it.panes) ? it.panes : []).filter((p) => s.items[p]?.kind === 'tab' && !seen.has(p));
        it.panes.forEach((p) => seen.add(p));
        if (it.sizes?.length !== it.panes.length) it.sizes = it.panes.map(() => 1 / Math.max(1, it.panes.length));
        it.focused = Math.min(Math.max(0, it.focused ?? 0), Math.max(0, it.panes.length - 1));
        // A split with one page left becomes that page again (never lose a tab).
        if (it.panes.length === 1) {
          out.push(it.panes[0]);
          seen.delete(id);
          continue;
        }
        if (it.panes.length === 0) continue;
      }
      out.push(id);
    }
    return out;
  };

  s.favorites = clean(s.favorites, false).filter((id) => s.items[id].kind === 'tab');
  for (const sp of s.spaces) {
    sp.pinned = clean(sp.pinned, true);
    sp.today = clean(sp.today, false);
  }
  // Anything not reachable is dropped so the file doesn't grow forever.
  for (const id of Object.keys(s.items)) if (!seen.has(id)) delete s.items[id];

  if (!s.spaces.some((x) => x.id === s.activeSpaceId)) s.activeSpaceId = s.spaces[0].id;
  for (const sp of s.spaces) {
    const a = s.activeBySpace[sp.id];
    if (a === undefined || (a !== null && !s.items[a])) s.activeBySpace[sp.id] = null;
  }
  for (const k of Object.keys(s.activeBySpace)) if (!s.spaces.some((x) => x.id === k)) delete s.activeBySpace[k];
}

/** What gets written to disk. History is trimmed to keep the file small. */
export function serialize(s: AppState): string {
  return JSON.stringify({ ...s, history: s.history.slice(0, 5000) });
}

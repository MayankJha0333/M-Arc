// Changing settings safely (values are kept within sensible limits).

import { DEFAULT_SHORTCUTS, defaultSettings } from './defaults';
import type { AppState, MotionFeel, Settings } from './types';
import { sanitizeShields } from './shields';
import { defaultLook, sanitizeLook, styleById, type StyleId } from './look';
import { loadState, serialize } from './persistence';

export const MOTION_FEELS: MotionFeel[] = ['style', 'smooth', 'snappy', 'bouncy'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const LIMITS = {
  sidebarWidth: [200, 440],
  fontScale: [0.85, 1.25],
  radius: [0, 24],
  gap: [0, 20],
  favoritesColumns: [3, 6],
  awakeTabs: [3, 30],
  motionSpeed: [0.5, 2],
  soundVolume: [0, 1],
} as const;

export function updateSettings(s: AppState, patch: Partial<Settings>): void {
  const next = { ...s.settings, ...patch };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const key = k as keyof typeof LIMITS;
    const v = Number(next[key]);
    (next as Record<string, unknown>)[key] = Number.isFinite(v) ? clamp(key === 'fontScale' || key === 'motionSpeed' || key === 'soundVolume' ? v : Math.round(v), lo, hi) : defaultSettings()[key];
  }
  next.look = sanitizeLook(next.look);
  next.shields = sanitizeShields(next.shields);
  if (!MOTION_FEELS.includes(next.motionFeel)) next.motionFeel = 'style';
  for (const k of ['httpsOnly', 'sendGpc', 'askWhereToSave', 'sounds'] as const) next[k] = !!next[k];
  if (typeof next.searchEngine !== 'string' || !next.searchEngine.includes('%s') || !/^https?:\/\//i.test(next.searchEngine)) next.searchEngine = s.settings.searchEngine;
  s.settings = next;
}

/** Appearance back to defaults (keeps shortcuts, archive and search choices). */
export function resetAppearance(s: AppState): void {
  const d = defaultSettings();
  const keys: (keyof Settings)[] = ['sidebarSide', 'sidebarWidth', 'density', 'font', 'fontScale', 'radius', 'gap', 'showUrlBar', 'showTabCloseOnHover', 'favoritesColumns', 'reduceMotion', 'motionSpeed', 'motionFeel', 'sounds', 'soundVolume', 'chromeCss', 'look'];
  for (const k of keys) (s.settings as unknown as Record<string, unknown>)[k] = d[k];
}

/** Which other action already uses this shortcut (or null). */
export function shortcutConflict(s: AppState, action: string, combo: string): string | null {
  if (!combo) return null;
  for (const [a, c] of Object.entries(s.settings.shortcuts)) if (a !== action && c === combo) return a;
  if (combo === s.settings.littleHotkey && action !== 'littleWindow') return 'littleHotkey';
  return null;
}

/**
 * Give an action a new shortcut. If another action had it, that one is
 * cleared (so two actions never share keys). Returns the cleared action.
 */
export function setShortcut(s: AppState, action: string, combo: string): string | null {
  const other = shortcutConflict(s, action, combo);
  if (other && other !== 'littleHotkey') s.settings.shortcuts[other] = '';
  s.settings.shortcuts[action] = combo;
  if (action === 'littleWindow') s.settings.littleHotkey = combo;
  return other;
}

export function resetShortcuts(s: AppState, action?: string): void {
  if (action) {
    const def = DEFAULT_SHORTCUTS[action] ?? '';
    const other = shortcutConflict(s, action, def);
    if (other && other !== 'littleHotkey') s.settings.shortcuts[other] = '';
    s.settings.shortcuts[action] = def;
    if (action === 'littleWindow') s.settings.littleHotkey = def;
  } else {
    s.settings.shortcuts = { ...DEFAULT_SHORTCUTS };
    s.settings.littleHotkey = DEFAULT_SHORTCUTS.littleWindow;
  }
}

export function clearHistory(s: AppState): void {
  s.history = [];
}

/** A full backup of Kite as a file. */
export function exportBackup(s: AppState): string {
  return JSON.stringify({ kind: 'kite-backup', exportedAt: new Date().toISOString(), state: JSON.parse(serialize(s)) }, null, 1);
}

export interface BackupInfo {
  state: AppState;
  spaces: number;
  tabs: number;
  notes: number;
  boosts: number;
  /** Boost scripts found in the file and left out for safety. */
  scriptsRemoved: number;
}

/**
 * Read a backup file. Throws with a readable message if it isn't one or is empty.
 * Boost scripts are removed: a backup from someone else could carry scripts
 * that run on sites like your bank.
 */
export function readBackup(text: string): BackupInfo {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Kite backup.');
  }
  const r = raw as { kind?: string; state?: unknown };
  if (r?.kind !== 'kite-backup' || typeof r.state !== 'object' || r.state === null || Array.isArray(r.state)) throw new Error('That file isn’t a Kite backup.');
  const rawState = r.state as { items?: unknown; spaces?: unknown };
  if (typeof rawState.items !== 'object' || !Array.isArray(rawState.spaces)) throw new Error('That backup is damaged or empty.');
  const state = loadState(r.state);
  let scriptsRemoved = 0;
  for (const b of state.boosts) {
    if (b.js?.trim()) scriptsRemoved++;
    b.js = '';
  }
  const items = Object.values(state.items);
  return {
    state,
    spaces: state.spaces.length,
    tabs: items.filter((x) => x.kind === 'tab').length,
    notes: items.filter((x) => x.kind === 'note').length,
    boosts: state.boosts.length,
    scriptsRemoved,
  };
}

/**
 * Pick a visual style: its look and its recommended shape and type come with it
 * (radius, spacing, density, font). Everything can be fine-tuned afterwards.
 */
export function applyStyle(s: AppState, style: StyleId): void {
  const d = styleById(style).defaults;
  updateSettings(s, { look: { ...defaultLook(style), accent: s.settings.look.accent }, radius: d.radius, gap: d.gap, density: d.density, font: d.font });
}

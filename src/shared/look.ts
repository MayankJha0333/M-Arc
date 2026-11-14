import type { AppState, Settings, SpaceTheme, ThemeMode } from './types';

// Kite's design system: visual styles ("looks") and curated colour palettes.
//
// A style is a complete, coherent direction — surfaces, borders, shadows,
// translucency, how the selected tab is drawn, recommended type and shape. On top
// of a style the user tunes a few levers (border, shadow, translucency, accent,
// backdrop, contrast). Each Space keeps its own two colours and light/dark mode.
//
// Everything here is pure and tested; the renderer turns it into CSS variables.

export type StyleId = 'calm' | 'glass' | 'paper' | 'mono' | 'studio';
export type Backdrop = 'tint' | 'gradient' | 'mesh' | 'solid';
export type ContrastLevel = 'standard' | 'high';
/** How the selected tab is drawn. */
export type ActiveRow = 'lift' | 'glass' | 'bar' | 'soft' | 'glow';

export interface Look {
  style: StyleId;
  backdrop: Backdrop;
  /** 0–1: how defined borders and dividers are. */
  border: number;
  /** 0–1: how deep shadows are. */
  shadow: number;
  /** 0–1: how see-through panels are (frosted). */
  translucency: number;
  /** null = taken from the Space's colours. */
  accent: string | null;
  contrast: ContrastLevel;
}

interface Tone {
  /** Window background before the Space tint. */
  base: string;
  /** Page card / popups. */
  card: string;
  ink: string;
  /** How strongly Space colours tint the chrome at full intensity. */
  tint: [number, number];
}

export interface StyleDef {
  id: StyleId;
  name: string;
  tagline: string;
  /** Who it's for, in a few words. */
  mood: string;
  light: Tone;
  dark: Tone;
  activeRow: ActiveRow;
  /** Defaults applied when you pick the style (you can fine-tune after). */
  defaults: { backdrop: Backdrop; border: number; shadow: number; translucency: number; radius: number; gap: number; density: 'compact' | 'comfortable' | 'roomy'; font: 'figtree' | 'bricolage' | 'inter' | 'system' | 'mono' };
  /** Motion feel: easing used for most transitions, and a base duration (ms). */
  motion: { ease: string; ms: number };
}

export const STYLES: readonly StyleDef[] = [
  {
    id: 'calm',
    name: 'Calm',
    tagline: 'Soft tinted chrome, the page floats on a card.',
    mood: 'Everyday browsing',
    light: { base: '#f4f1ec', card: '#ffffff', ink: '#1e1c1a', tint: [0.18, 0.62] },
    dark: { base: '#16171c', card: '#1f2027', ink: '#f1efea', tint: [0.12, 0.38] },
    activeRow: 'lift',
    defaults: { backdrop: 'gradient', border: 0.35, shadow: 0.5, translucency: 0, radius: 12, gap: 8, density: 'comfortable', font: 'figtree' },
    motion: { ease: 'cubic-bezier(0.16, 1, 0.3, 1)', ms: 220 },
  },
  {
    id: 'glass',
    name: 'Glass',
    tagline: 'Frosted panels over a soft colour field.',
    mood: 'Light, airy, modern',
    light: { base: '#eef1f6', card: '#ffffff', ink: '#14161c', tint: [0.3, 0.75] },
    dark: { base: '#0e1015', card: '#171a21', ink: '#eef1f6', tint: [0.22, 0.55] },
    activeRow: 'glass',
    defaults: { backdrop: 'mesh', border: 0.55, shadow: 0.6, translucency: 0.7, radius: 16, gap: 10, density: 'comfortable', font: 'figtree' },
    motion: { ease: 'cubic-bezier(0.32, 0.72, 0, 1)', ms: 280 },
  },
  {
    id: 'paper',
    name: 'Paper',
    tagline: 'Flat, crisp and editorial. Lines instead of shadows.',
    mood: 'Reading and writing',
    light: { base: '#f6f3ec', card: '#fffdf8', ink: '#22201b', tint: [0.04, 0.22] },
    dark: { base: '#191813', card: '#201f19', ink: '#ece7da', tint: [0.04, 0.16] },
    activeRow: 'bar',
    defaults: { backdrop: 'solid', border: 0.8, shadow: 0, translucency: 0, radius: 6, gap: 6, density: 'comfortable', font: 'bricolage' },
    motion: { ease: 'cubic-bezier(0.4, 0, 0.2, 1)', ms: 160 },
  },
  {
    id: 'mono',
    name: 'Focus',
    tagline: 'Quiet greys, colour only where it matters.',
    mood: 'Deep work, fewer distractions',
    light: { base: '#f3f3f2', card: '#ffffff', ink: '#18181a', tint: [0.0, 0.08] },
    dark: { base: '#131314', card: '#1b1b1d', ink: '#ededee', tint: [0.0, 0.06] },
    activeRow: 'soft',
    defaults: { backdrop: 'solid', border: 0.5, shadow: 0.2, translucency: 0, radius: 8, gap: 6, density: 'compact', font: 'inter' },
    motion: { ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)', ms: 140 },
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'Deep, saturated and glowing. Made for dark rooms.',
    mood: 'Creative, expressive',
    light: { base: '#f1eff6', card: '#ffffff', ink: '#16141d', tint: [0.3, 0.8] },
    dark: { base: '#0a0a0f', card: '#14141c', ink: '#f2f0fa', tint: [0.3, 0.7] },
    activeRow: 'glow',
    defaults: { backdrop: 'mesh', border: 0.4, shadow: 0.85, translucency: 0.35, radius: 14, gap: 8, density: 'comfortable', font: 'inter' },
    motion: { ease: 'cubic-bezier(0.34, 1.18, 0.64, 1)', ms: 260 },
  },
];

export const styleById = (id: string): StyleDef => STYLES.find((s) => s.id === id) ?? STYLES[0];

/** Curated colour pairs for Spaces: [first, second]. Chosen to work in light and dark. */
export interface Palette {
  id: string;
  name: string;
  colors: [string, string];
}

export const PALETTES: readonly Palette[] = [
  { id: 'dune', name: 'Dune', colors: ['#e9c9a0', '#c8794f'] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#9fd8d0', '#2d8a9c'] },
  { id: 'orchid', name: 'Orchid', colors: ['#e5b8e8', '#8a4fc8'] },
  { id: 'moss', name: 'Moss', colors: ['#cfe0a6', '#5c8a3e'] },
  { id: 'ember', name: 'Ember', colors: ['#ffc59e', '#e0483a'] },
  { id: 'arctic', name: 'Arctic', colors: ['#cfe4ff', '#4a7fe0'] },
  { id: 'sakura', name: 'Sakura', colors: ['#ffd3de', '#d9557a'] },
  { id: 'citrus', name: 'Citrus', colors: ['#f6eb9a', '#e39b22'] },
  { id: 'aurora', name: 'Aurora', colors: ['#a9f0d1', '#6a5cf0'] },
  { id: 'slate', name: 'Slate', colors: ['#cdd3dc', '#4d5868'] },
  { id: 'cocoa', name: 'Cocoa', colors: ['#e3cbb4', '#7a5640'] },
  { id: 'graphite', name: 'Graphite', colors: ['#d6d6d6', '#3a3a3c'] },
];

/** Accent swatches offered when you don't want the Space's own accent. */
export const ACCENTS: readonly string[] = ['#4a7fe0', '#6a5cf0', '#d9557a', '#e0483a', '#e39b22', '#2d8a9c', '#5c8a3e', '#3a3a3c'];

export function defaultLook(style: StyleId = 'calm'): Look {
  const d = styleById(style).defaults;
  return { style, backdrop: d.backdrop, border: d.border, shadow: d.shadow, translucency: d.translucency, accent: null, contrast: 'standard' };
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Make any saved or incoming value a valid Look (unknown values fall back to the style's defaults). */
export function sanitizeLook(v: unknown): Look {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const style = STYLES.some((s) => s.id === o.style) ? (o.style as StyleId) : 'calm';
  const d = defaultLook(style);
  return {
    style,
    backdrop: (['tint', 'gradient', 'mesh', 'solid'] as const).includes(o.backdrop as Backdrop) ? (o.backdrop as Backdrop) : d.backdrop,
    border: clamp01(o.border, d.border),
    shadow: clamp01(o.shadow, d.shadow),
    translucency: clamp01(o.translucency, d.translucency),
    accent: isHex(o.accent) ? o.accent.toLowerCase() : null,
    contrast: o.contrast === 'high' ? 'high' : 'standard',
  };
}

// ---- Previewing, applying and sharing a look -------------------------------------


/** What the Appearance studio is previewing (not saved until you press Apply). */
export interface LookDraft {
  settings?: Partial<Pick<Settings, 'look' | 'radius' | 'gap' | 'density' | 'font'>>;
  theme?: Partial<SpaceTheme>;
  /** Apply the colours and mode to every Space, not just the current one. */
  allSpaces?: boolean;
}

/** Everything a look changes, so it can be undone. */
export interface LookSnapshot {
  settings: Pick<Settings, 'look' | 'radius' | 'gap' | 'density' | 'font'>;
  themes: Record<string, SpaceTheme>;
}

export function snapshotLook(s: AppState): LookSnapshot {
  const { look, radius, gap, density, font } = s.settings;
  return { settings: { look: { ...look }, radius, gap, density, font }, themes: Object.fromEntries(s.spaces.map((sp) => [sp.id, { ...sp.theme, colors: [...sp.theme.colors] as [string, string] }])) };
}

export function restoreLook(s: AppState, snap: LookSnapshot): void {
  Object.assign(s.settings, snap.settings, { look: sanitizeLook(snap.settings.look) });
  for (const sp of s.spaces) if (snap.themes[sp.id]) sp.theme = { ...snap.themes[sp.id] };
}

const MODES: ThemeMode[] = ['light', 'dark', 'system'];

/** A Space theme with only valid values. */
export function sanitizeTheme(t: Partial<SpaceTheme> | undefined, fallback: SpaceTheme): SpaceTheme {
  const colors = Array.isArray(t?.colors) && t!.colors.length === 2 && t!.colors.every(isHex) ? ([t!.colors[0].toLowerCase(), t!.colors[1].toLowerCase()] as [string, string]) : fallback.colors;
  return {
    colors,
    mode: MODES.includes(t?.mode as ThemeMode) ? (t!.mode as ThemeMode) : fallback.mode,
    intensity: clamp01(t?.intensity, fallback.intensity),
    grain: typeof t?.grain === 'boolean' ? t.grain : fallback.grain,
  };
}

/** Make a previewed look permanent: settings, plus colours/mode for this Space or all Spaces. */
export function applyLookDraft(s: AppState, draft: LookDraft, spaceId: string): void {
  if (draft.settings) {
    const st = draft.settings;
    if (st.look) s.settings.look = sanitizeLook(st.look);
    if (typeof st.radius === 'number') s.settings.radius = Math.round(Math.max(0, Math.min(24, st.radius)));
    if (typeof st.gap === 'number') s.settings.gap = Math.round(Math.max(0, Math.min(20, st.gap)));
    if (st.density && ['compact', 'comfortable', 'roomy'].includes(st.density)) s.settings.density = st.density;
    if (st.font && ['figtree', 'bricolage', 'inter', 'system', 'mono'].includes(st.font)) s.settings.font = st.font;
  }
  if (draft.theme) {
    for (const sp of s.spaces) {
      if (sp.id !== spaceId && !draft.allSpaces) continue;
      // Other Spaces keep their own colours unless the draft changes colours too.
      sp.theme = sanitizeTheme({ ...sp.theme, ...draft.theme }, sp.theme);
    }
  }
}

/** A shareable theme: everything that makes a look, nothing personal. */
export interface SharedTheme {
  look: Look;
  theme: SpaceTheme;
  radius: number;
  gap: number;
  density: Settings['density'];
  font: Settings['font'];
}

const PREFIX = 'kite-theme:';

export function encodeTheme(t: SharedTheme): string {
  const json = JSON.stringify({ v: 1, ...t });
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return PREFIX + b64;
}

/** Read a shared theme code. Returns null if it isn't one; every value is checked. */
export function decodeTheme(code: string, fallbackTheme: SpaceTheme): SharedTheme | null {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX) || raw.length > 4000) return null;
  try {
    const b64 = raw.slice(PREFIX.length);
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || o.v !== 1) return null;
    const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v))) : d);
    const look = sanitizeLook(o.look);
    const d = styleById(look.style).defaults;
    return {
      look,
      theme: sanitizeTheme(o.theme as Partial<SpaceTheme>, fallbackTheme),
      radius: num(o.radius, 0, 24, d.radius),
      gap: num(o.gap, 0, 20, d.gap),
      density: ['compact', 'comfortable', 'roomy'].includes(o.density as string) ? (o.density as Settings['density']) : d.density,
      font: ['figtree', 'bricolage', 'inter', 'system', 'mono'].includes(o.font as string) ? (o.font as Settings['font']) : d.font,
    };
  } catch {
    return null;
  }
}

// ---- Ready-made themes ----------------------------------------------------------
// A theme is a style plus colours tuned together. Picking one previews it; every
// part can still be changed afterwards. Each is checked for readability in light
// and dark (see tests/unit/themes.test.ts).

export interface ThemePreset {
  id: string;
  name: string;
  /** A few words on its character. */
  note: string;
  style: StyleId;
  colors: [string, string];
  intensity: number;
  grain: boolean;
  /** Overrides on top of the style's own defaults. */
  look?: Partial<Pick<Look, 'backdrop' | 'border' | 'shadow' | 'translucency' | 'accent'>>;
}

export const THEMES: readonly ThemePreset[] = [
  { id: 'daybreak', name: 'Daybreak', note: 'Warm and soft', style: 'calm', colors: ['#f2c9a0', '#e58f65'], intensity: 0.55, grain: true },
  { id: 'harbor', name: 'Harbor', note: 'Clear blue, calm', style: 'calm', colors: ['#cfe4ff', '#4a7fe0'], intensity: 0.5, grain: true },
  { id: 'aurora', name: 'Aurora', note: 'Frosted, mint to violet', style: 'glass', colors: ['#a9f0d1', '#6a5cf0'], intensity: 0.5, grain: false },
  { id: 'lagoon', name: 'Lagoon', note: 'Frosted teal', style: 'glass', colors: ['#9fd8d0', '#2d8a9c'], intensity: 0.55, grain: false },
  { id: 'ink', name: 'Ink', note: 'Flat, editorial', style: 'paper', colors: ['#e3cbb4', '#7a5640'], intensity: 0.6, grain: false },
  { id: 'graphite', name: 'Graphite', note: 'Neutral, no distractions', style: 'mono', colors: ['#d6d6d6', '#3a3a3c'], intensity: 0.5, grain: false, look: { accent: '#4a7fe0' } },
  { id: 'nebula', name: 'Nebula', note: 'Deep violet glow', style: 'studio', colors: ['#e5b8e8', '#8a4fc8'], intensity: 0.45, grain: true },
  { id: 'ember', name: 'Ember', note: 'Bold and warm', style: 'studio', colors: ['#ffc59e', '#e0483a'], intensity: 0.35, grain: true },
  { id: 'sakura', name: 'Sakura', note: 'Gentle pink', style: 'calm', colors: ['#ffd3de', '#d9557a'], intensity: 0.45, grain: true },
  { id: 'moss', name: 'Moss', note: 'Quiet green', style: 'paper', colors: ['#cfe0a6', '#5c8a3e'], intensity: 0.7, grain: false },
  // Clear glass over a cool field, like the newest system look, but kept readable.
  { id: 'tahoe', name: 'Tahoe', note: 'Clear glass, cool blue', style: 'glass', colors: ['#d7e3f4', '#3d6fe0'], intensity: 0.45, grain: false, look: { backdrop: 'gradient', translucency: 0.55 } },
  { id: 'dusk', name: 'Dusk', note: 'Soft periwinkle evening', style: 'calm', colors: ['#d8d3fa', '#5b4fd6'], intensity: 0.5, grain: true },
];

/** The theme a new copy of Kite starts with. */
export const DEFAULT_THEME_ID = 'harbor';

/** What picking a theme previews: its style's shape and type, its colours, and its tuning. */
export function themeDraft(t: ThemePreset, keep: Pick<Look, 'contrast'>): LookDraft {
  const d = styleById(t.style).defaults;
  return {
    settings: { look: { ...defaultLook(t.style), ...t.look, contrast: keep.contrast }, radius: d.radius, gap: d.gap, density: d.density, font: d.font },
    theme: { colors: [...t.colors] as [string, string], intensity: t.intensity, grain: t.grain },
  };
}

/** Which ready-made theme the current look is (null when it has been changed). */
export function matchTheme(look: Look, theme: SpaceTheme): ThemePreset | null {
  return (
    THEMES.find((t) => {
      const want = { ...defaultLook(t.style), ...t.look };
      return (
        t.style === look.style && t.colors[0] === theme.colors[0].toLowerCase() && t.colors[1] === theme.colors[1].toLowerCase() && Math.abs(t.intensity - theme.intensity) < 0.001 &&
        want.backdrop === look.backdrop && want.accent === look.accent && Math.abs(want.border - look.border) < 0.001 && Math.abs(want.shadow - look.shadow) < 0.001 && Math.abs(want.translucency - look.translucency) < 0.001
      );
    }) ?? null
  );
}

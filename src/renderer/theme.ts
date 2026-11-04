// Turns a Space theme + settings into CSS variables for the whole window.

import type { Settings, SpaceTheme } from '@shared/types';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: RGB) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;

/** Blend a toward b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Relative brightness 0–1 (WCAG luminance). */
export function luminance(hex: string): number {
  const ch = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function resolveDark(theme: SpaceTheme, systemDark: boolean): boolean {
  return theme.mode === 'dark' || (theme.mode === 'system' && systemDark);
}

const FONTS: Record<Settings['font'], string> = {
  figtree: "'Figtree', ui-sans-serif, system-ui, sans-serif",
  bricolage: "'Bricolage Grotesque', 'Figtree', ui-sans-serif, sans-serif",
  system: "ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
};

const ROW: Record<Settings['density'], number> = { compact: 30, comfortable: 36, roomy: 42 };

export function themeVars(theme: SpaceTheme, settings: Settings, systemDark: boolean): Record<string, string> {
  const dark = resolveDark(theme, systemDark);
  const base = dark ? '#16171c' : '#f4f1ec';
  const t = Math.max(0, Math.min(1, theme.intensity));
  // In dark mode the tint is held back so colors glow instead of shout.
  const k = dark ? 0.12 + t * 0.38 : 0.18 + t * 0.62;
  const a = mix(base, theme.colors[0], k);
  const b = mix(base, theme.colors[1], k);
  const ink = dark ? '#f1efea' : '#1e1c1a';
  const accentRaw = theme.colors[1];
  // Accent must stay readable on the chrome; push it toward the ink color until it is.
  let accent = accentRaw;
  for (let i = 0; i < 8 && contrast(accent, mix(a, b, 0.5)) < 3; i++) accent = mix(accent, ink, 0.18);
  return {
    '--chrome-a': a,
    '--chrome-b': b,
    '--chrome-mid': mix(a, b, 0.5),
    '--ink': ink,
    '--ink-2': dark ? 'rgba(241,239,234,.68)' : 'rgba(30,28,26,.64)',
    '--ink-3': dark ? 'rgba(241,239,234,.42)' : 'rgba(30,28,26,.40)',
    '--hover': dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.42)',
    '--active': dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.78)',
    '--active-shadow': dark ? '0 1px 0 rgba(255,255,255,.06) inset, 0 2px 10px rgba(0,0,0,.25)' : '0 1px 2px rgba(60,40,20,.08), 0 2px 10px rgba(60,40,20,.06)',
    '--line': dark ? 'rgba(255,255,255,.09)' : 'rgba(40,30,20,.10)',
    '--card': dark ? '#1f2027' : '#ffffff',
    '--overlay': dark ? 'rgba(24,25,31,.92)' : 'rgba(252,250,247,.94)',
    '--scrim': dark ? 'rgba(0,0,0,.45)' : 'rgba(40,30,20,.22)',
    '--accent': accent,
    '--accent-ink': luminance(accent) > 0.45 ? '#1e1c1a' : '#ffffff',
    '--tint-1': theme.colors[0],
    '--tint-2': theme.colors[1],
    '--shadow': dark ? '0 0 0 1px rgba(255,255,255,.06), 0 12px 32px rgba(0,0,0,.45)' : '0 0 0 1px rgba(60,40,20,.06), 0 10px 30px rgba(60,40,20,.12)',
    '--grain-opacity': theme.grain ? (dark ? '.10' : '.16') : '0',
    '--font': FONTS[settings.font],
    '--scale': String(settings.fontScale),
    '--radius': `${settings.radius}px`,
    '--gap': `${settings.gap}px`,
    '--sidebar-w': `${settings.sidebarWidth}px`,
    '--row-h': `${ROW[settings.density]}px`,
    colorScheme: dark ? 'dark' : 'light',
  };
}

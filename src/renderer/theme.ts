// Turns a Space theme + settings into CSS variables for the whole window.

import type { Settings, SpaceTheme } from '@shared/types';
import { defaultLook, styleById, type Look, type StyleDef } from '@shared/look';

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
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  system: "ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
};

/** Animation feels you can pick instead of the style's own. */
export const FEEL: Partial<Record<Settings['motionFeel'], { ease: string; ms: number }>> = {
  smooth: { ease: 'cubic-bezier(0.32, 0.72, 0, 1)', ms: 300 },
  snappy: { ease: 'cubic-bezier(0.2, 0, 0, 1)', ms: 130 },
  bouncy: { ease: 'cubic-bezier(0.34, 1.45, 0.64, 1)', ms: 320 },
};

const ROW: Record<Settings['density'], number> = { compact: 30, comfortable: 36, roomy: 42 };

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;
};

/** How the selected tab and hovered rows look, per style. */
function rowSurfaces(style: StyleDef, dark: boolean, accent: string, translucent: number): Record<string, string> {
  switch (style.activeRow) {
    case 'glass':
      return {
        '--hover': dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.36)',
        '--active': dark ? `rgba(255,255,255,${0.1 + translucent * 0.06})` : `rgba(255,255,255,${0.78 - translucent * 0.3})`,
        '--active-shadow': dark ? 'inset 0 0 0 1px rgba(255,255,255,.12), 0 8px 24px rgba(0,0,0,.3)' : 'inset 0 0 0 1px rgba(255,255,255,.75), 0 6px 20px rgba(30,40,80,.10)',
      };
    case 'bar':
      return {
        '--hover': dark ? 'rgba(255,255,255,.05)' : 'rgba(40,30,20,.045)',
        '--active': dark ? 'rgba(255,255,255,.07)' : 'rgba(40,30,20,.06)',
        '--active-shadow': `inset 3px 0 0 ${accent}`,
      };
    case 'soft':
      return {
        '--hover': dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
        '--active': dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.07)',
        '--active-shadow': 'none',
      };
    case 'glow':
      return {
        '--hover': dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.4)',
        '--active': dark ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.8)',
        '--active-shadow': `inset 0 0 0 1px ${rgba(accent, dark ? 0.55 : 0.45)}, 0 0 22px ${rgba(accent, dark ? 0.32 : 0.22)}`,
      };
    default:
      return {
        '--hover': dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.42)',
        '--active': dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.78)',
        '--active-shadow': dark ? '0 1px 0 rgba(255,255,255,.06) inset, 0 2px 10px rgba(0,0,0,.25)' : '0 1px 2px rgba(60,40,20,.08), 0 2px 10px rgba(60,40,20,.06)',
      };
  }
}

/** The window's background, per backdrop choice. */
function backdropCss(kind: Look['backdrop'], base: string, a: string, b: string, colors: [string, string], dark: boolean): string {
  const mid = mix(a, b, 0.5);
  switch (kind) {
    case 'solid':
      return mix(base, mid, 0.35);
    case 'tint':
      return mid;
    case 'mesh':
      return [
        `radial-gradient(120% 90% at 0% 0%, ${rgba(colors[0], dark ? 0.32 : 0.55)} 0%, transparent 55%)`,
        `radial-gradient(110% 90% at 100% 15%, ${rgba(colors[1], dark ? 0.3 : 0.42)} 0%, transparent 60%)`,
        `radial-gradient(120% 80% at 40% 100%, ${rgba(mix(colors[0], colors[1], 0.5), dark ? 0.22 : 0.35)} 0%, transparent 60%)`,
        base,
      ].join(', ');
    default:
      return `linear-gradient(165deg, ${a} 0%, ${mid} 55%, ${b} 100%)`;
  }
}

/**
 * Everything the window's look needs, as CSS variables: the style (look), the
 * Space's colours and light/dark mode, and the layout settings.
 */
export function themeVars(theme: SpaceTheme, settings: Settings, systemDark: boolean): Record<string, string> {
  const look = settings.look ?? defaultLook('calm');
  const style = styleById(look.style);
  const dark = resolveDark(theme, systemDark);
  const tone = dark ? style.dark : style.light;
  const base = tone.base;
  const t = Math.max(0, Math.min(1, theme.intensity));
  // In dark mode the tint is held back so colours glow instead of shout.
  const k = tone.tint[0] + t * (tone.tint[1] - tone.tint[0]);
  const a = mix(base, theme.colors[0], k);
  const b = mix(base, theme.colors[1], k);
  const ink = tone.ink;
  const high = look.contrast === 'high';
  const accentRaw = look.accent ?? theme.colors[1];
  // The accent must stay readable on the chrome; push it toward the ink colour until it is.
  let accent = accentRaw;
  for (let i = 0; i < 8 && contrast(accent, mix(a, b, 0.5)) < 3; i++) accent = mix(accent, ink, 0.18);
  const lineA = (dark ? 0.02 + look.border * 0.2 : 0.02 + look.border * 0.2286) + (high ? 0.08 : 0);
  const lineRgb = dark ? '255,255,255' : '40,30,20';
  const ringA = (dark ? 0.06 : 0.06) * (look.border / 0.35);
  const depth = look.shadow / 0.5;
  // A hairline ring, a tight contact shadow and a soft ambient one: depth without a grey halo.
  const shadow = dark
    ? `0 0 0 1px rgba(255,255,255,${Math.min(0.2, ringA).toFixed(3)})${look.shadow > 0 ? `, 0 1px 2px rgba(0,0,0,${Math.min(0.5, 0.3 * depth).toFixed(3)}), 0 14px 36px -8px rgba(0,0,0,${Math.min(0.8, 0.5 * depth).toFixed(3)})` : ''}`
    : `0 0 0 1px rgba(60,40,20,${Math.min(0.2, ringA).toFixed(3)})${look.shadow > 0 ? `, 0 1px 2px rgba(60,40,20,${Math.min(0.12, 0.05 * depth).toFixed(3)}), 0 14px 36px -8px rgba(60,40,20,${Math.min(0.32, 0.15 * depth).toFixed(3)})` : ''}`;
  const glassy = look.translucency;
  const overlayA = 0.94 - glassy * 0.22;
  return {
    '--chrome-a': a,
    '--chrome-b': b,
    '--chrome-mid': mix(a, b, 0.5),
    '--backdrop': backdropCss(look.backdrop, base, a, b, theme.colors, dark),
    '--ink': ink,
    '--ink-2': rgba(ink, high ? 0.86 : dark ? 0.68 : 0.64),
    '--ink-3': rgba(ink, high ? 0.62 : dark ? 0.42 : 0.4),
    ...rowSurfaces(style, dark, accent, glassy),
    '--line': `rgba(${lineRgb},${lineA.toFixed(3)})`,
    '--card': tone.card,
    '--overlay': dark ? rgba(mix(tone.card, '#000000', 0.15), overlayA - 0.02) : rgba(mix(tone.card, base, 0.3), overlayA),
    '--blur': `${Math.round(8 + glassy * 26)}px`,
    '--scrim': dark ? 'rgba(0,0,0,.45)' : 'rgba(40,30,20,.22)',
    '--accent': accent,
    '--accent-ink': luminance(accent) > 0.45 ? '#1e1c1a' : '#ffffff',
    '--accent-soft': rgba(accent, dark ? 0.22 : 0.14),
    '--tint-1': theme.colors[0],
    '--tint-2': theme.colors[1],
    '--shadow': shadow,
    '--grain-opacity': theme.grain ? (dark ? '.10' : '.16') : '0',
    '--font': FONTS[settings.font] ?? FONTS.figtree,
    '--scale': String(settings.fontScale),
    '--radius': `${settings.radius}px`,
    '--gap': `${settings.gap}px`,
    '--sidebar-w': `${settings.sidebarWidth}px`,
    '--row-h': `${ROW[settings.density]}px`,
    '--ease': FEEL[settings.motionFeel]?.ease ?? style.motion.ease,
    '--dur': `${Math.round((FEEL[settings.motionFeel]?.ms ?? style.motion.ms) / (settings.motionSpeed || 1))}ms`,
    '--speed': String(1 / (settings.motionSpeed || 1)),
    colorScheme: dark ? 'dark' : 'light',
  };
}

/**
 * How readable a look is: text on the sidebar, and the accent on the sidebar.
 * Ratios follow WCAG (4.5 is the bar for normal text, 3 for large text and icons).
 */
export function readability(theme: SpaceTheme, settings: Settings, systemDark: boolean): { text: number; accent: number; ok: boolean } {
  const v = themeVars(theme, settings, systemDark);
  const chrome = v['--chrome-mid'];
  const text = contrast(v['--ink'], chrome);
  const accent = contrast(v['--accent'], chrome);
  return { text: Math.round(text * 10) / 10, accent: Math.round(accent * 10) / 10, ok: text >= 4.5 && accent >= 3 };
}

/** The strongest tint (0–1) that keeps text on the sidebar readable. */
export function readableIntensity(theme: SpaceTheme, settings: Settings, systemDark: boolean): number {
  let i = theme.intensity;
  while (i > 0 && readability({ ...theme, intensity: i }, settings, systemDark).text < 4.5) i = Math.max(0, Math.round((i - 0.05) * 100) / 100);
  return i;
}

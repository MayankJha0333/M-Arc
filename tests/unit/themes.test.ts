import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, THEMES, applyLookDraft, matchTheme, themeDraft, defaultLook, STYLES } from '../../src/shared/look';
import { createInitialState, defaultSettings } from '../../src/shared/defaults';
import { readability } from '../../src/renderer/theme';
import type { Settings, SpaceTheme } from '../../src/shared/types';

const build = (id: string, mode: 'light' | 'dark') => {
  const t = THEMES.find((x) => x.id === id)!;
  const d = themeDraft(t, { contrast: 'standard' });
  const settings = { ...defaultSettings(), ...d.settings } as Settings;
  const theme = { colors: t.colors, intensity: t.intensity, grain: t.grain, mode } as SpaceTheme;
  return { settings, theme };
};

describe('ready-made themes', () => {
  it('every theme is readable in light and in dark', () => {
    const table: string[] = [];
    for (const t of THEMES) {
      for (const mode of ['light', 'dark'] as const) {
        const { settings, theme } = build(t.id, mode);
        const r = readability(theme, settings, mode === 'dark');
        table.push(`${t.id.padEnd(9)} ${mode.padEnd(5)} text ${String(r.text).padStart(5)}  accent ${String(r.accent).padStart(4)}`);
        expect(r.text, `${t.id} ${mode} text`).toBeGreaterThanOrEqual(7); // comfortably above the 4.5 minimum
        expect(r.accent, `${t.id} ${mode} accent`).toBeGreaterThanOrEqual(3);
      }
    }
    if (process.env.SHOW_THEMES) console.log(`\n${table.join('\n')}`);
  });

  it('ids are unique, styles exist, and every style has at least one theme', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const s of STYLES) expect(THEMES.some((t) => t.style === s.id), s.id).toBe(true);
    expect(THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
  });

  it('applying a theme sets style, shape, type and colours; it is then recognised until you change it', () => {
    const s = createInitialState();
    const nebula = THEMES.find((t) => t.id === 'nebula')!;
    applyLookDraft(s, themeDraft(nebula, s.settings.look), s.activeSpaceId);
    expect(s.settings.look.style).toBe('studio');
    expect(s.settings).toMatchObject({ radius: 14, font: 'inter' });
    expect(s.spaces[0].theme.colors).toEqual(nebula.colors);
    expect(matchTheme(s.settings.look, s.spaces[0].theme)?.id).toBe('nebula');
    s.settings.look.shadow = 0.1;
    expect(matchTheme(s.settings.look, s.spaces[0].theme)).toBeNull();
  });

  it('a new copy of Kite starts on the default theme; light/dark choice is kept when switching themes', () => {
    const s = createInitialState();
    expect(matchTheme(s.settings.look, s.spaces[0].theme)?.id).toBe(DEFAULT_THEME_ID);
    expect(s.settings.look).toEqual(defaultLook('calm'));
    s.spaces[0].theme.mode = 'dark';
    applyLookDraft(s, themeDraft(THEMES[2], s.settings.look), s.activeSpaceId);
    expect(s.spaces[0].theme.mode).toBe('dark');
  });
});

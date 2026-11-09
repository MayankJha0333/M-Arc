import { describe, expect, it } from 'vitest';
import { PALETTES, STYLES, applyLookDraft, decodeTheme, defaultLook, encodeTheme, restoreLook, sanitizeLook, sanitizeTheme, snapshotLook } from '@shared/look';
import { applyStyle } from '@shared/settings';
import { createSpace } from '@shared/spaces';
import { themeVars, readability, readableIntensity, contrast } from '../../src/renderer/theme';
import { fresh, run } from './helpers';

describe('looks (design system)', () => {
  it('every style is complete and its defaults are valid', () => {
    expect(STYLES.map((s) => s.id)).toEqual(['calm', 'glass', 'paper', 'mono', 'studio']);
    for (const st of STYLES) {
      expect(sanitizeLook(defaultLook(st.id))).toEqual(defaultLook(st.id));
      expect(st.motion.ms).toBeGreaterThan(0);
    }
  });

  it('bad saved values fall back to safe ones', () => {
    expect(sanitizeLook(null)).toEqual(defaultLook('calm'));
    const l = sanitizeLook({ style: 'paper', border: 9, shadow: -1, translucency: 'x', accent: 'red', contrast: 'ultra', backdrop: 'video' });
    expect(l).toEqual({ ...defaultLook('paper'), border: 1, shadow: 0 });
    expect(sanitizeLook({ accent: '#ABCDEF' }).accent).toBe('#abcdef');
  });

  it('the Calm style keeps Kite looking exactly as before', () => {
    const s = fresh();
    const v = themeVars({ colors: ['#f2c9a0', '#e58f65'], mode: 'light', intensity: 0.55, grain: true }, s.settings, false);
    expect(v['--card']).toBe('#ffffff');
    expect(v['--ink']).toBe('#1e1c1a');
    expect(v['--line']).toBe('rgba(40,30,20,0.100)');
    expect(v['--backdrop']).toMatch(/^linear-gradient\(165deg/);
  });

  it('picking a style sets its shape and type, and keeps your accent', () => {
    let s = fresh();
    [s] = run(s, (d) => { d.settings.look.accent = '#d9557a'; applyStyle(d, 'paper'); });
    expect(s.settings.look).toMatchObject({ style: 'paper', backdrop: 'solid', accent: '#d9557a' });
    expect(s.settings).toMatchObject({ radius: 6, font: 'bricolage' });
  });

  it('text stays readable in every style and palette at the default strength', () => {
    const s = fresh();
    for (const st of STYLES) {
      for (const p of PALETTES) {
        for (const mode of ['light', 'dark'] as const) {
          const theme = { colors: p.colors, mode, intensity: 0.55, grain: false };
          const settings = { ...s.settings, look: defaultLook(st.id) };
          const r = readability(theme, settings, false);
          expect(r.text, `${st.id} ${p.id} ${mode}`).toBeGreaterThanOrEqual(4.5);
          expect(r.accent, `${st.id} ${p.id} ${mode} accent`).toBeGreaterThanOrEqual(2.9);
        }
      }
    }
  });

  it('Fix lowers the colour strength until text is readable', () => {
    const s = fresh();
    const theme = { colors: ['#3a3a3c', '#111111'] as [string, string], mode: 'light' as const, intensity: 1, grain: false };
    const settings = { ...s.settings, look: defaultLook('studio') };
    const before = readability(theme, settings, false);
    const i = readableIntensity(theme, settings, false);
    if (before.text < 4.5) expect(i).toBeLessThan(1);
    expect(readability({ ...theme, intensity: i }, settings, false).text).toBeGreaterThanOrEqual(4.5);
    const v = themeVars({ ...theme, intensity: i }, settings, false);
    expect(contrast(v['--ink'], v['--chrome-mid'])).toBeGreaterThanOrEqual(4.5);
  });

  it('Apply changes this Space only, or every Space; Undo puts everything back', () => {
    let s = fresh();
    [s] = run(s, (d) => { createSpace(d, { name: 'Two' }); });
    const [first, second] = s.spaces;
    const secondColors = second.theme.colors;
    const snap = snapshotLook(s);
    const draft = { settings: { look: defaultLook('glass'), radius: 16 }, theme: { colors: ['#9fd8d0', '#2d8a9c'] as [string, string], mode: 'dark' as const } };
    [s] = run(s, (d) => applyLookDraft(d, draft, first.id));
    expect(s.settings.look.style).toBe('glass');
    expect(s.settings.radius).toBe(16);
    expect(s.spaces[0].theme).toMatchObject({ colors: ['#9fd8d0', '#2d8a9c'], mode: 'dark' });
    expect(s.spaces[1].theme.colors).toEqual(secondColors);
    [s] = run(s, (d) => applyLookDraft(d, { ...draft, allSpaces: true }, first.id));
    expect(s.spaces[1].theme.colors).toEqual(['#9fd8d0', '#2d8a9c']);
    [s] = run(s, (d) => restoreLook(d, snap));
    expect(s.settings.look.style).toBe('calm');
    expect(s.spaces[0].theme).toEqual(first.theme);
    expect(s.spaces[1].theme).toEqual(second.theme);
  });

  it('bad values in a preview are cleaned before they are saved', () => {
    let s = fresh();
    const id = s.activeSpaceId;
    [s] = run(s, (d) => applyLookDraft(d, { settings: { radius: 999, font: 'comic' as never }, theme: { colors: ['nope', '#fff'] as never, intensity: 7 } }, id));
    expect(s.settings.radius).toBe(24);
    expect(s.settings.font).not.toBe('comic');
    expect(s.spaces[0].theme.intensity).toBe(1);
    expect(s.spaces[0].theme.colors).toEqual(fresh().spaces[0].theme.colors);
  });

  it('theme codes round-trip and reject anything else', () => {
    const s = fresh();
    const theme = sanitizeTheme({ colors: ['#cfe4ff', '#4a7fe0'], mode: 'dark', intensity: 0.4, grain: false }, s.spaces[0].theme);
    const shared = { look: { ...defaultLook('studio'), accent: '#6a5cf0' }, theme, radius: 14, gap: 8, density: 'comfortable' as const, font: 'inter' as const };
    const code = encodeTheme(shared);
    expect(code.startsWith('kite-theme:')).toBe(true);
    expect(decodeTheme(code, s.spaces[0].theme)).toEqual(shared);
    expect(decodeTheme('hello', theme)).toBeNull();
    expect(decodeTheme('kite-theme:!!!', theme)).toBeNull();
    expect(decodeTheme('kite-theme:' + 'A'.repeat(5000), theme)).toBeNull();
    // A tampered code is cleaned, never trusted.
    const bad = 'kite-theme:' + Buffer.from(JSON.stringify({ v: 1, look: { style: 'x', accent: 'javascript:1' }, theme: { colors: ['#000', 1] }, radius: 1e9, font: '<b>' })).toString('base64');
    const t = decodeTheme(bad, theme)!;
    expect(t.look).toEqual(defaultLook('calm'));
    expect(t.radius).toBe(24);
    expect(t.theme.colors).toEqual(theme.colors);
    expect(t.font).toBe('figtree');
  });
});

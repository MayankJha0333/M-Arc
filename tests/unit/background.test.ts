import { describe, expect, it } from 'vitest';
import { addStop, gradientCss, gradientFromColors, motionSeconds, removeStop, sanitizeGradient, sanitizeMotion } from '@shared/background';
import { sanitizeTheme, themeDraft, THEMES, matchTheme, defaultLook } from '@shared/look';
import type { SpaceTheme } from '@shared/types';

const id = (c: string) => c;
const alpha = (c: string, a: number) => `${c}/${a}`;
const base: SpaceTheme = { colors: ['#cfe4ff', '#4a7fe0'], mode: 'system', intensity: 0.5, grain: true };

describe('Space background', () => {
  it('a gradient keeps 2–5 valid stops, in order, within 0–100', () => {
    const g = sanitizeGradient({ kind: 'linear', angle: 725, stops: [{ color: '#FF0000', at: 120 }, { color: 'nope', at: 5 }, { color: '#00ff00', at: -10 }] })!;
    expect(g.angle).toBe(5);
    expect(g.stops).toEqual([{ color: '#00ff00', at: 0 }, { color: '#ff0000', at: 100 }]);
    expect(sanitizeGradient({ kind: 'linear', stops: [{ color: '#ff0000', at: 0 }] })).toBeUndefined();
    const many = sanitizeGradient({ kind: 'mesh', angle: 0, stops: Array.from({ length: 8 }, (_, i) => ({ color: '#000000', at: i * 10 })) })!;
    expect(many.stops).toHaveLength(5);
    expect(sanitizeGradient({ kind: 'weird', angle: 10, stops: [{ color: '#000000', at: 0 }, { color: '#ffffff', at: 100 }] })!.kind).toBe('linear');
  });

  it('adding a stop fills the widest gap; removing never goes below two', () => {
    let g = gradientFromColors(['#000000', '#ffffff']);
    g = addStop(g, () => '#808080');
    expect(g.stops.map((s) => s.at)).toEqual([0, 50, 100]);
    g = addStop(g, () => '#404040');
    expect(g.stops.map((s) => s.at)).toEqual([0, 25, 50, 100]);
    expect(removeStop(removeStop(removeStop(g, 0), 0), 0).stops).toHaveLength(2);
  });

  it('draws each kind of gradient', () => {
    const g = gradientFromColors(['#111111', '#222222']);
    expect(gradientCss(g, id, alpha, '#fff')).toBe('linear-gradient(165deg, #111111 0%, #222222 100%)');
    expect(gradientCss({ ...g, kind: 'radial', angle: 0 }, id, alpha, '#fff')).toContain('at 50% 0%');
    expect(gradientCss({ ...g, kind: 'conic', angle: 90 }, id, alpha, '#fff')).toBe('conic-gradient(from 90deg at 50% 50%, #111111 0%, #222222 100%, #111111 100%)');
    const mesh = gradientCss({ ...g, kind: 'mesh' }, id, alpha, '#fff');
    expect(mesh.match(/radial-gradient/g)).toHaveLength(2);
    expect(mesh.endsWith('#fff')).toBe(true);
  });

  it('motion is slow by default and speeds up with the speed setting', () => {
    expect(sanitizeMotion({ kind: 'none', speed: 1 })).toBeUndefined();
    expect(sanitizeMotion({ kind: 'drift', speed: 10 })).toEqual({ kind: 'drift', speed: 3 });
    expect(motionSeconds({ kind: 'drift', speed: 1 })).toBe(24);
    expect(motionSeconds({ kind: 'drift', speed: 2 })).toBe(12);
  });

  it('a Space theme keeps valid extras, drops broken ones, and removes them on request', () => {
    const t = sanitizeTheme({ ...base, gradient: gradientFromColors(['#000000', '#ffffff']), motion: { kind: 'swirl', speed: 1 } }, base);
    expect(t.gradient?.stops).toHaveLength(2);
    expect(t.motion?.kind).toBe('swirl');
    // A pattern saved by an earlier version is dropped.
    expect('pattern' in sanitizeTheme({ ...base, pattern: { kind: 'dots' } } as never, base)).toBe(false);
    const broken = sanitizeTheme({ ...base, gradient: { kind: 'linear', angle: 0, stops: [] } as never }, base);
    expect(broken.gradient).toBeUndefined();
    const removed = sanitizeTheme({ ...t, gradient: undefined, motion: undefined }, t);
    expect(removed.gradient).toBeUndefined();
    expect(removed.motion).toBeUndefined();
  });

  it('picking a ready-made theme clears a custom background, and a custom one is not a preset', () => {
    const preset = THEMES.find((x) => x.id === 'harbor')!;
    const d = themeDraft(preset, defaultLook('calm'));
    expect(d.theme).toMatchObject({ gradient: undefined, motion: undefined });
    const look = { ...defaultLook('calm') };
    const plain = { ...base, colors: [...preset.colors] as [string, string], intensity: preset.intensity, grain: preset.grain };
    expect(matchTheme(look, plain)?.id).toBe('harbor');
    expect(matchTheme(look, { ...plain, motion: { kind: 'drift', speed: 1 } })).toBeNull();
  });
});

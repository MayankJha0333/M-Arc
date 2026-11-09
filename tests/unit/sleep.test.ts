import { describe, expect, it } from 'vitest';
import { keepAwake, sleepAllBut } from '@shared/sleep';
import { updateSettings } from '@shared/settings';
import { fresh, run } from './helpers';

describe('sleeping tabs (memory)', () => {
  it('keeps the most recent tabs awake and puts the oldest to sleep', () => {
    let l: string[] = [];
    for (const id of ['a', 'b', 'c', 'd']) l = keepAwake(l, id, 3);
    expect(l).toEqual(['b', 'c', 'd']);
    l = keepAwake(l, 'b', 3);
    expect(l).toEqual(['c', 'd', 'b']);
  });

  it('never puts a playing tab to sleep, even over the limit', () => {
    let l: string[] = [];
    const playing = (id: string) => id === 'music';
    for (const id of ['music', 'a', 'b', 'c', 'd']) l = keepAwake(l, id, 3, playing);
    expect(l).toContain('music');
    expect(l).toEqual(['music', 'c', 'd']);
    l = keepAwake(['music', 'video'], 'x', 1, () => true);
    expect(l).toEqual(['music', 'video', 'x']);
  });

  it('the tab you open is always awake', () => {
    expect(keepAwake(['a', 'b'], 'c', 0)).toEqual(['c']);
  });

  it('“sleep others” keeps only what you choose', () => {
    expect(sleepAllBut(['a', 'b', 'c'], (x) => x === 'b')).toEqual(['b']);
  });

  it('the awake-tabs setting stays within 3–30', () => {
    let s = fresh();
    expect(s.settings.awakeTabs).toBe(10);
    [s] = run(s, (d) => updateSettings(d, { awakeTabs: 100 }));
    expect(s.settings.awakeTabs).toBe(30);
    [s] = run(s, (d) => updateSettings(d, { awakeTabs: 1 }));
    expect(s.settings.awakeTabs).toBe(3);
  });
});

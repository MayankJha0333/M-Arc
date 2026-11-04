import { describe, expect, it } from 'vitest';
import { planOnAppBlur, planOnAppFocus, planOnSwitch } from '@shared/pip';

const on = { autoPip: true, autoPipOnAppSwitch: true };

describe('auto picture-in-picture', () => {
  it('switching away from a playing tab pops its video out', () => {
    expect(planOnSwitch(['a'], ['b'], { a: true }, [], on)).toEqual({ enter: 'a', exit: [] });
  });

  it('nothing happens for tabs that are not playing', () => {
    expect(planOnSwitch(['a'], ['b'], { a: false }, [], on)).toEqual({ enter: null, exit: [] });
  });

  it('coming back to the tab brings the video back', () => {
    expect(planOnSwitch(['b'], ['a'], { a: true }, ['a'], on)).toEqual({ enter: null, exit: ['a'] });
  });

  it('a playing pane that stays visible (split view) does not pop out', () => {
    expect(planOnSwitch(['a', 'b'], ['a', 'c'], { a: true, b: false }, [], on).enter).toBeNull();
  });

  it('only one video pops out; the focused pane wins', () => {
    expect(planOnSwitch(['a', 'b'], ['c'], { a: true, b: true }, [], on, 'b').enter).toBe('b');
    expect(planOnSwitch(['a', 'b'], ['c'], { a: true, b: true }, [], on, 'z').enter).toBe('a');
  });

  it('can be turned off', () => {
    const off = { autoPip: false, autoPipOnAppSwitch: true };
    expect(planOnSwitch(['a'], ['b'], { a: true }, [], off).enter).toBeNull();
    expect(planOnSwitch(['b'], ['a'], { a: true }, ['a'], off).exit).toEqual(['a']); // still returns videos
    expect(planOnAppBlur(['a'], { a: true }, off).enter).toBeNull();
    expect(planOnAppBlur(['a'], { a: true }, { autoPip: true, autoPipOnAppSwitch: false }).enter).toBeNull();
  });

  it('switching to another app pops out the visible playing video; returning brings it back', () => {
    expect(planOnAppBlur(['a', 'b'], { b: true }, on)).toEqual({ enter: 'b', exit: [] });
    expect(planOnAppBlur(['a'], {}, on).enter).toBeNull();
    expect(planOnAppFocus(['a', 'b'], ['b', 'z'])).toEqual({ enter: null, exit: ['b'] });
  });
});

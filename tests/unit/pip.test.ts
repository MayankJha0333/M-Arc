import { describe, expect, it } from 'vitest';
import { appSwitchTargets, PIP_ENTER_SCRIPT, pipPopped, planOnSwitch } from '@shared/pip';

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
    expect(appSwitchTargets(['a'], off, 'a')).toEqual([]);
    expect(appSwitchTargets(['a'], { autoPip: true, autoPipOnAppSwitch: false }, 'a')).toEqual([]);
  });

  it('switching to another app tries the visible pages, focused pane first', () => {
    expect(appSwitchTargets(['a', 'b', 'c'], on, 'b')).toEqual(['b', 'a', 'c']);
    expect(appSwitchTargets(['a'], on, null)).toEqual(['a']);
    expect(appSwitchTargets(['a'], on, 'gone')).toEqual(['a']);
    expect(appSwitchTargets([], on, null)).toEqual([]);
  });
});

/** Runs the in-page pop-out script against a pretend page. */
function runEnter(doc: Record<string, unknown>) {
  return new Function('document', `return ${PIP_ENTER_SCRIPT}`)(doc) as Promise<string>;
}
const video = (o: Record<string, unknown> = {}) => ({
  paused: false, ended: false, readyState: 4, videoWidth: 1280, clientWidth: 800, clientHeight: 450,
  muted: false, volume: 1, disablePictureInPicture: false, requestPictureInPicture: async () => undefined, ...o,
});
const page = (vids: unknown[], o: Record<string, unknown> = {}) => ({
  pictureInPictureEnabled: true, pictureInPictureElement: null, querySelectorAll: () => vids, ...o,
});

describe('pop-out script inside the page', () => {
  it('pops out the largest playing video and says ok', async () => {
    let popped = '';
    const small = video({ clientWidth: 300, clientHeight: 170, requestPictureInPicture: async () => void (popped = 'small') });
    const big = video({ requestPictureInPicture: async () => void (popped = 'big') });
    expect(await runEnter(page([small, big]))).toBe('ok');
    expect(popped).toBe('big');
  });

  it('explains why nothing popped out', async () => {
    expect(await runEnter(page([], { pictureInPictureEnabled: false }))).toBe('off');
    expect(await runEnter(page([], { pictureInPictureElement: {} }))).toBe('already');
    expect(await runEnter(page([]))).toBe('none');
    expect(await runEnter(page([video({ paused: true })]))).toMatch(/^skipped paused/);
    // A small muted autoplay clip (an ad) is left alone.
    expect(await runEnter(page([video({ muted: true, clientWidth: 200 })]))).toMatch(/^skipped playing.*muted/);
    const refused = video({ requestPictureInPicture: async () => Promise.reject(Object.assign(new Error('needs a click'), { name: 'NotAllowedError' })) });
    expect(await runEnter(page([refused]))).toBe('error NotAllowedError: needs a click');
  });

  it('only ok and already count as popped out', () => {
    expect(pipPopped('ok')).toBe(true);
    expect(pipPopped('already')).toBe(true);
    for (const s of ['none', 'off', 'skipped x', 'error y', true, undefined]) expect(pipPopped(s)).toBe(false);
  });
});

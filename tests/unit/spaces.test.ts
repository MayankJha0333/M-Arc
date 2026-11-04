import { describe, expect, it } from 'vitest';
import { createSpace, deleteSpace, moveSpace, nthSpace, setSpaceTheme, stepSpace, switchSpace, updateSpace } from '@shared/spaces';
import { newTab, pinItem, activeItemId, select } from '@shared/ops';
import { fresh, run, T0 } from './helpers';

describe('spaces', () => {
  it('creates and activates a new Space with its own theme', () => {
    let s = fresh();
    let id: string;
    [s, id] = run(s, (d) => createSpace(d, { name: 'Work', icon: '💼' }));
    expect(s.spaces).toHaveLength(2);
    expect(s.activeSpaceId).toBe(id);
    expect(s.spaces[1]).toMatchObject({ name: 'Work', icon: '💼', pinned: [], today: [] });
    expect(s.spaces[1].theme.colors).not.toEqual(s.spaces[0].theme.colors);
    expect(s.activeBySpace[id]).toBeNull();
  });

  it('gives a default name when none is typed', () => {
    const [s] = run(fresh(), (d) => createSpace(d, { name: '  ' }));
    expect(s.spaces[1].name).toBe('Space 2');
  });

  it('tabs open in the active Space and selection is remembered per Space', () => {
    let s = fresh();
    const home = s.spaces[0].id;
    let a: string, b: string, work: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s, work] = run(s, (d) => createSpace(d, { name: 'Work' }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    expect(s.spaces[1].today).toEqual([b]);
    expect(activeItemId(s)).toBe(b);
    [s] = run(s, (d) => switchSpace(d, home));
    expect(activeItemId(s)).toBe(a);
    [s] = run(s, (d) => switchSpace(d, work));
    expect(activeItemId(s)).toBe(b);
  });

  it('selecting an item in another Space switches to it', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => createSpace(d, {}));
    [s] = run(s, (d) => select(d, a, T0));
    expect(s.activeSpaceId).toBe(s.spaces[0].id);
  });

  it('steps and jumps between Spaces, wrapping around', () => {
    let s = fresh();
    [s] = run(s, (d) => createSpace(d, { name: 'B' }));
    [s] = run(s, (d) => createSpace(d, { name: 'C' }));
    [s] = run(s, (d) => stepSpace(d, 1));
    expect(s.activeSpaceId).toBe(s.spaces[0].id);
    [s] = run(s, (d) => stepSpace(d, -1));
    expect(s.activeSpaceId).toBe(s.spaces[2].id);
    [s] = run(s, (d) => nthSpace(d, 2));
    expect(s.activeSpaceId).toBe(s.spaces[1].id);
    [s] = run(s, (d) => nthSpace(d, 9));
    expect(s.activeSpaceId).toBe(s.spaces[2].id);
    const [, ok] = run(s, (d) => nthSpace(d, 5));
    expect(ok).toBe(false);
  });

  it('renames, changes icon (max 2 characters) and per-Space archive time', () => {
    let s = fresh();
    const id = s.spaces[0].id;
    [s] = run(s, (d) => updateSpace(d, id, { name: ' Life ', icon: '🌿🌿🌿', archiveAfterMs: null }));
    expect(s.spaces[0]).toMatchObject({ name: 'Life', icon: '🌿🌿', archiveAfterMs: null });
    [s] = run(s, (d) => updateSpace(d, id, { name: '' }));
    expect(s.spaces[0].name).toBe('Life');
  });

  it('updates theme and clamps intensity', () => {
    let s = fresh();
    const id = s.spaces[0].id;
    [s] = run(s, (d) => setSpaceTheme(d, id, { colors: ['#000000', '#ffffff'], mode: 'dark', intensity: 4 }));
    expect(s.spaces[0].theme).toMatchObject({ colors: ['#000000', '#ffffff'], mode: 'dark', intensity: 1 });
  });

  it('deleting a Space archives its tabs and moves to a neighbour; the last one stays', () => {
    let s = fresh();
    let work: string, a: string;
    [s, work] = run(s, (d) => createSpace(d, { name: 'Work' }));
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => {
      d.routes.push({ id: 'r', matchType: 'host', value: 'x.com', target: { type: 'space', spaceId: work }, enabled: true });
    });
    let ok: boolean;
    [s, ok] = run(s, (d) => deleteSpace(d, work, T0));
    expect(ok).toBe(true);
    expect(s.spaces).toHaveLength(1);
    expect(s.activeSpaceId).toBe(s.spaces[0].id);
    expect(s.archive).toHaveLength(2);
    expect(Object.keys(s.items)).toHaveLength(0);
    expect(s.routes[0].enabled).toBe(false);
    [s, ok] = run(s, (d) => deleteSpace(d, d.spaces[0].id, T0));
    expect(ok).toBe(false);
  });

  it('reorders Spaces', () => {
    let s = fresh();
    [s] = run(s, (d) => createSpace(d, { name: 'B' }));
    [s] = run(s, (d) => createSpace(d, { name: 'C' }));
    [s] = run(s, (d) => moveSpace(d, d.spaces[2].id, 0));
    expect(s.spaces.map((x) => x.name)).toEqual(['C', 'Home', 'B']);
  });
});

import { describe, expect, it } from 'vitest';
import { activeItemId, addFavorite, closeItem, newTab, pinItem, removeFavorite, select, setHomeHere, togglePin, unpinItem, updateTab, displayTitle } from '@shared/ops';
import { locate } from '@shared/tree';
import { fresh, run, T0 } from './helpers';
import type { AppState } from '@shared/types';

function withTabs(n: number): [AppState, string[]] {
  let s = fresh();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    let id: string;
    [s, id] = run(s, (d) => newTab(d, { url: `https://site${i}.com`, title: `Site ${i}`, now: T0 }));
    ids.push(id);
  }
  return [s, ids];
}

describe('pinned tabs', () => {
  it('pinning moves to the bottom of Pinned and remembers the home URL', () => {
    let [s, [a, b]] = withTabs(2);
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => pinItem(d, b));
    expect(s.spaces[0].pinned).toEqual([a, b]);
    expect(s.spaces[0].today).toEqual([]);
    expect(s.items[a]).toMatchObject({ homeUrl: 'https://site0.com' });
  });

  it('closing a pinned tab keeps it and resets it to its home URL', () => {
    let [s, [a]] = withTabs(1);
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => updateTab(d, a, { url: 'https://site0.com/deep' }, T0));
    [s] = run(s, (d) => select(d, a, T0));
    [s] = run(s, (d) => closeItem(d, a, T0));
    expect(s.spaces[0].pinned).toEqual([a]);
    expect(s.items[a]).toMatchObject({ url: 'https://site0.com' });
    expect(activeItemId(s)).toBeNull();
    expect(s.closed).toHaveLength(0);
  });

  it('unpinning puts it at the top of Today and forgets home', () => {
    let [s, [a, b]] = withTabs(2);
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => unpinItem(d, a));
    expect(s.spaces[0].today).toEqual([a, b]);
    expect((s.items[a] as { homeUrl?: string }).homeUrl).toBeUndefined();
  });

  it('togglePin flips between the two', () => {
    let [s, [a]] = withTabs(1);
    [s] = run(s, (d) => togglePin(d, a));
    expect(locate(s, a)?.list).toBe('pinned');
    [s] = run(s, (d) => togglePin(d, a));
    expect(locate(s, a)?.list).toBe('today');
  });

  it('tidies the title when pinning (if enabled) without losing the real title', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://github.com/x/y', title: 'x/y: thing · GitHub', now: T0 }));
    [s] = run(s, (d) => pinItem(d, a));
    expect(displayTitle(s.items[a])).toBe('x/y: thing');
    expect(s.items[a]).toMatchObject({ title: 'x/y: thing · GitHub' });
    let b: string;
    [s, b] = run(s, (d) => newTab(d, { url: 'https://github.com/q', title: 'q · GitHub', now: T0 }));
    [s] = run(s, (d) => pinItem(d, b, false));
    expect(displayTitle(s.items[b])).toBe('q · GitHub');
  });

  it('“set as home” updates the remembered page', () => {
    let [s, [a]] = withTabs(1);
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => updateTab(d, a, { url: 'https://site0.com/inbox' }, T0));
    [s] = run(s, (d) => setHomeHere(d, a));
    expect(s.items[a]).toMatchObject({ homeUrl: 'https://site0.com/inbox' });
  });

  it('cannot pin twice or pin unknown items', () => {
    let [s, [a]] = withTabs(1);
    let r: boolean;
    [s, r] = run(s, (d) => pinItem(d, a));
    expect(r).toBe(true);
    [s, r] = run(s, (d) => pinItem(d, a));
    expect(r).toBe(false);
    [, r] = run(s, (d) => pinItem(d, 'nope'));
    expect(r).toBe(false);
  });
});

describe('favorites', () => {
  it('adds tabs to the shared Favorites list in order', () => {
    let [s, [a, b]] = withTabs(2);
    [s] = run(s, (d) => addFavorite(d, a));
    [s] = run(s, (d) => addFavorite(d, b, 0));
    expect(s.favorites).toEqual([b, a]);
    expect(s.spaces[0].today).toEqual([]);
    expect(locate(s, a)).toMatchObject({ list: 'favorites', spaceId: null });
  });

  it('closing a favorite keeps it and resets it', () => {
    let [s, [a]] = withTabs(1);
    [s] = run(s, (d) => addFavorite(d, a));
    [s] = run(s, (d) => updateTab(d, a, { url: 'https://site0.com/x' }, T0));
    [s] = run(s, (d) => closeItem(d, a, T0));
    expect(s.favorites).toEqual([a]);
    expect(s.items[a]).toMatchObject({ url: 'https://site0.com' });
  });

  it('favorites stay put when switching Spaces', () => {
    let [s, [a]] = withTabs(1);
    [s] = run(s, (d) => addFavorite(d, a));
    [s] = run(s, (d) => {
      d.spaces.push({ ...d.spaces[0], id: 'sp2', name: 'Two', pinned: [], today: [] });
      d.activeSpaceId = 'sp2';
    });
    [s] = run(s, (d) => select(d, a, T0));
    expect(s.activeSpaceId).toBe('sp2');
    expect(s.activeBySpace.sp2).toBe(a);
  });

  it('removing a favorite drops it into the current Space', () => {
    let [s, [a, b]] = withTabs(2);
    [s] = run(s, (d) => addFavorite(d, a));
    [s] = run(s, (d) => addFavorite(d, b));
    [s] = run(s, (d) => removeFavorite(d, a));
    expect(s.spaces[0].today).toEqual([a]);
    [s] = run(s, (d) => removeFavorite(d, b, 'pinned'));
    expect(s.spaces[0].pinned).toEqual([b]);
    expect(s.items[b]).toMatchObject({ homeUrl: 'https://site1.com' });
  });

  it('only tabs can be favorites', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.items.n = { id: 'n', kind: 'note', title: 'N', html: '', createdAt: 0, updatedAt: 0, lastActiveAt: 0 };
      d.spaces[0].today.push('n');
    });
    const [, r] = run(s, (d) => addFavorite(d, 'n'));
    expect(r).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { activeItemId, closeItem, cycleTab, displayTitle, newTab, renameItem, reopenClosed, select, selectNth, updateTab } from '@shared/ops';
import { flatVisible, locate } from '@shared/tree';
import { fresh, run, T0 } from './helpers';

describe('sidebar tabs', () => {
  it('new tabs go to the top of Today and become active', () => {
    let s = fresh();
    let a: string, b: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 + 1 }));
    expect(s.spaces[0].today).toEqual([b, a]);
    expect(activeItemId(s)).toBe(b);
    expect(s.items[a].kind).toBe('tab');
  });

  it('background tabs do not steal focus', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0, activate: false }));
    expect(activeItemId(s)).toBe(a);
  });

  it('closing the active Today tab selects the next one, then the previous', () => {
    let s = fresh();
    const ids: string[] = [];
    for (const u of ['a', 'b', 'c']) {
      let id: string;
      [s, id] = run(s, (d) => newTab(d, { url: `https://${u}.com`, now: T0 }));
      ids.push(id);
    }
    // order is c, b, a
    [s] = run(s, (d) => select(d, ids[1], T0));
    [s] = run(s, (d) => closeItem(d, ids[1], T0));
    expect(activeItemId(s)).toBe(ids[0]); // next below b is a
    [s] = run(s, (d) => closeItem(d, ids[0], T0));
    expect(activeItemId(s)).toBe(ids[2]); // nothing below, go up
    [s] = run(s, (d) => closeItem(d, ids[2], T0));
    expect(activeItemId(s)).toBeNull();
    expect(Object.keys(s.items)).toHaveLength(0);
  });

  it('closing an inactive tab keeps the selection', () => {
    let s = fresh();
    let a: string, b: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => closeItem(d, a, T0));
    expect(activeItemId(s)).toBe(b);
  });

  it('reopens closed tabs in the same place, newest first', () => {
    let s = fresh();
    let a: string, b: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => closeItem(d, a, T0));
    [s] = run(s, (d) => closeItem(d, b, T0));
    let r: string | null;
    [s, r] = run(s, (d) => reopenClosed(d, T0));
    expect(r).toBe(b);
    [s, r] = run(s, (d) => reopenClosed(d, T0));
    expect(r).toBe(a);
    expect(s.spaces[0].today).toEqual([b, a]);
    expect(activeItemId(s)).toBe(a);
    [s, r] = run(s, (d) => reopenClosed(d, T0));
    expect(r).toBeNull();
  });

  it('updates url, title, favicon and records history', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => updateTab(d, a, { url: 'https://a.com/x', title: 'X page', favicon: 'data:x' }, T0 + 5));
    const t = s.items[a];
    expect(t).toMatchObject({ url: 'https://a.com/x', title: 'X page', favicon: 'data:x' });
    expect(s.history[0]).toMatchObject({ url: 'https://a.com/x', visits: 1 });
    [s] = run(s, (d) => updateTab(d, a, { url: 'https://a.com/x' }, T0 + 6));
    [s] = run(s, (d) => updateTab(d, a, { title: '   ' }, T0 + 6));
    expect(s.items[a]).toMatchObject({ title: 'X page' });
  });

  it('renames tabs with a custom title that can be cleared', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', title: 'Page', now: T0 }));
    [s] = run(s, (d) => renameItem(d, a, 'My name'));
    expect(displayTitle(s.items[a])).toBe('My name');
    [s] = run(s, (d) => renameItem(d, a, ''));
    expect(displayTitle(s.items[a])).toBe('Page');
  });

  it('cycles and jumps by number', () => {
    let s = fresh();
    const ids: string[] = [];
    for (const u of ['a', 'b', 'c']) {
      let id: string;
      [s, id] = run(s, (d) => newTab(d, { url: `https://${u}.com`, now: T0 }));
      ids.push(id);
    }
    const order = flatVisible(s, s.activeSpaceId, true);
    expect(order).toEqual([ids[2], ids[1], ids[0]]);
    expect(activeItemId(s)).toBe(order[0]);
    [s] = run(s, (d) => cycleTab(d, 1, T0));
    expect(activeItemId(s)).toBe(order[1]);
    [s] = run(s, (d) => cycleTab(d, -1, T0));
    [s] = run(s, (d) => cycleTab(d, -1, T0));
    expect(activeItemId(s)).toBe(order[2]); // wraps from first to last
    [s] = run(s, (d) => cycleTab(d, 1, T0));
    expect(activeItemId(s)).toBe(order[0]); // wraps from last to first
  });

  it('⌘9 picks the last item, ⌘1 the first', () => {
    let s = fresh();
    const ids: string[] = [];
    for (const u of ['a', 'b', 'c']) {
      let id: string;
      [s, id] = run(s, (d) => newTab(d, { url: `https://${u}.com`, now: T0 }));
      ids.push(id);
    }
    [s] = run(s, (d) => selectNth(d, 9, T0));
    expect(activeItemId(s)).toBe(ids[0]);
    [s] = run(s, (d) => selectNth(d, 1, T0));
    expect(activeItemId(s)).toBe(ids[2]);
    expect(locate(s, ids[2])).toMatchObject({ list: 'today', index: 0 });
  });
});

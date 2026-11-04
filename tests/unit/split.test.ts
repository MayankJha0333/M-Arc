import { describe, expect, it } from 'vitest';
import { addToSplit, createSplit, moveDivider, movePane, openInSplit, separatePane, setOrientation, splitWith, resetSizes, MIN_PANE } from '@shared/split';
import { activeItemId, activeTab, closeItem, newTab, pinItem, reopenClosed, select } from '@shared/ops';
import { flatVisible, locate } from '@shared/tree';
import { loadState } from '@shared/persistence';
import { fresh, run, T0 } from './helpers';
import type { AppState, SplitItem } from '@shared/types';

function tabs(n: number): [AppState, string[]] {
  let s = fresh();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    let id: string;
    [s, id] = run(s, (d) => newTab(d, { url: `https://p${i}.com`, now: T0 }));
    ids.push(id);
  }
  return [s, ids];
}

const sizesSum = (sp: SplitItem) => sp.sizes.reduce((a, b) => a + b, 0);

describe('split view', () => {
  it('combines tabs into one sidebar item where the first tab was', () => {
    let [s, [a, b, c]] = tabs(3); // today: c, b, a
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [b, a], T0));
    expect(s.spaces[0].today).toEqual([c, id]);
    const sp = s.items[id!] as SplitItem;
    expect(sp.panes).toEqual([b, a]);
    expect(sp.sizes).toEqual([0.5, 0.5]);
    expect(locate(s, a)).toBeNull(); // panes live inside the split
  });

  it('needs at least two tabs and takes at most four', () => {
    let [s, ids] = tabs(5);
    let id: string | null;
    [, id] = run(s, (d) => createSplit(d, [ids[0]], T0));
    expect(id).toBeNull();
    [s, id] = run(s, (d) => createSplit(d, ids, T0));
    expect((s.items[id!] as SplitItem).panes).toHaveLength(4);
    let ok: boolean;
    [, ok] = run(s, (d) => addToSplit(d, id!, ids[4]));
    expect(ok).toBe(false);
  });

  it('opening a URL in split view grows the split and focuses the new pane', () => {
    let [s, [a]] = tabs(1);
    let t1: string | null, t2: string | null;
    [s, t1] = run(s, (d) => openInSplit(d, 'https://x.com', T0));
    const split = activeItemId(s)!;
    expect(s.items[split].kind).toBe('split');
    expect(activeTab(s)!.id).toBe(t1);
    [s, t2] = run(s, (d) => openInSplit(d, 'https://y.com', T0));
    expect((s.items[split] as SplitItem).panes).toEqual([a, t1, t2]);
    expect(activeTab(s)!.id).toBe(t2);
  });

  it('dropping a sidebar tab on the page combines it with the open tab', () => {
    let [s, [a, b]] = tabs(2);
    [s] = run(s, (d) => select(d, a, T0));
    let id: string | null;
    [s, id] = run(s, (d) => splitWith(d, b, T0));
    expect((s.items[id!] as SplitItem).panes).toEqual([a, b]);
    [, id] = run(s, (d) => splitWith(d, id!, T0));
    expect(id).toBeNull(); // can't split with itself
  });

  it('resizes with limits and resets evenly', () => {
    let [s, ids] = tabs(3);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, ids, T0));
    [s] = run(s, (d) => moveDivider(d, id!, 0, 0.5));
    let sp = s.items[id!] as SplitItem;
    expect(sp.sizes[0]).toBeCloseTo(0.5);
    expect(sp.sizes[2]).toBeCloseTo(1 / 3); // other panes untouched
    expect(sizesSum(sp)).toBeCloseTo(1);
    [s] = run(s, (d) => moveDivider(d, id!, 0, 0.01));
    sp = s.items[id!] as SplitItem;
    expect(sp.sizes[0]).toBeCloseTo(MIN_PANE);
    [s] = run(s, (d) => resetSizes(d, id!));
    expect((s.items[id!] as SplitItem).sizes.every((x) => Math.abs(x - 1 / 3) < 1e-9)).toBe(true);
  });

  it('flips orientation and reorders panes', () => {
    let [s, [a, b]] = tabs(2);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [a, b], T0));
    [s] = run(s, (d) => setOrientation(d, id!, 'column'));
    expect(s.items[id!]).toMatchObject({ orientation: 'column' });
    [s] = run(s, (d) => movePane(d, id!, 0, 1));
    expect((s.items[id!] as SplitItem).panes).toEqual([b, a]);
  });

  it('closing a pane removes it; with one left the split turns back into a tab', () => {
    let [s, [a, b, c]] = tabs(3);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [a, b, c], T0));
    [s] = run(s, (d) => select(d, b, T0));
    [s] = run(s, (d) => closeItem(d, b, T0));
    expect((s.items[id!] as SplitItem).panes).toEqual([a, c]);
    expect(s.items[b]).toBeUndefined();
    [s] = run(s, (d) => closeItem(d, c, T0));
    expect(s.items[id!]).toBeUndefined();
    expect(s.spaces[0].today).toContain(a);
  });

  it('separating a pane puts it back in the sidebar right after the split', () => {
    let [s, [a, b, c]] = tabs(3);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [a, b, c], T0));
    [s] = run(s, (d) => separatePane(d, id!, b, T0));
    const order = s.spaces[0].today;
    expect(order[order.indexOf(id!) + 1]).toBe(b);
    expect((s.items[id!] as SplitItem).panes).toEqual([a, c]);
  });

  it('can be pinned, closed whole, and reopened with all its pages', () => {
    let [s, [a, b]] = tabs(2);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [a, b], T0));
    [s] = run(s, (d) => pinItem(d, id!));
    expect(s.spaces[0].pinned).toEqual([id]);
    [s] = run(s, (d) => closeItem(d, id!, T0));
    expect(s.items[a]).toBeUndefined();
    [s] = run(s, (d) => reopenClosed(d, T0));
    expect((s.items[id!] as SplitItem).panes).toEqual([a, b]);
    expect(s.items[a]).toBeDefined();
  });

  it('counts as one item in ⌘-number order and survives save/load', () => {
    let [s, [a, b, c]] = tabs(3);
    let id: string | null;
    [s, id] = run(s, (d) => createSplit(d, [a, b], T0));
    expect(flatVisible(s, s.activeSpaceId, false)).toEqual([c, id]);
    const back = loadState(JSON.parse(JSON.stringify(s)));
    expect(back.items[id!]).toEqual(s.items[id!]);
    expect(back.items[a]).toBeDefined();
  });
});

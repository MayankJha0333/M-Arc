import { describe, expect, it } from 'vitest';
import { newTab, pinItem, addFavorite, select, activeItemId } from '@shared/ops';
import { createFolder, deleteFolder, dropItem, setAllFolders, ungroupFolder } from '@shared/folders';
import { locate, flatVisible } from '@shared/tree';
import { fresh, run, T0 } from './helpers';
import type { AppState } from '@shared/types';

function setup(n: number, pin = false): [AppState, string[]] {
  let s = fresh();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    let id: string;
    [s, id] = run(s, (d) => newTab(d, { url: `https://s${i}.com`, now: T0 }));
    ids.push(id);
  }
  if (pin) for (const id of ids) [s] = run(s, (d) => pinItem(d, id)); // pinned order: a, b, c
  return [s, ids];
}

describe('folders', () => {
  it('creates a folder at the bottom of Pinned, optionally filled', () => {
    let [s, [a, b]] = setup(2);
    let f: string;
    [s, f] = run(s, (d) => createFolder(d, { title: 'Work', items: [a, b], now: T0 }));
    expect(s.spaces[0].pinned).toEqual([f]);
    expect(s.items[f]).toMatchObject({ kind: 'folder', title: 'Work', children: [a, b] });
    expect(s.spaces[0].today).toEqual([]);
    expect(s.items[a]).toMatchObject({ homeUrl: 'https://s0.com' });
  });

  it('nests folders and finds items inside them', () => {
    let [s, [a]] = setup(1);
    let outer: string, inner: string;
    [s, outer] = run(s, (d) => createFolder(d, { now: T0 }));
    [s, inner] = run(s, (d) => createFolder(d, { parentId: outer, items: [a], now: T0 }));
    expect(locate(s, a)).toMatchObject({ list: 'pinned', parentId: inner });
    expect(locate(s, inner)).toMatchObject({ parentId: outer });
  });

  it('collapsed folders hide children from ⌘-number order; selecting a child opens its folder', () => {
    let [s, [a, b]] = setup(2);
    let f: string;
    [s, f] = run(s, (d) => createFolder(d, { items: [a], now: T0 }));
    [s] = run(s, (d) => setAllFolders(d, d.activeSpaceId, true));
    expect(flatVisible(s, s.activeSpaceId, false)).toEqual([b]);
    [s] = run(s, (d) => select(d, a, T0));
    expect(s.items[f]).toMatchObject({ collapsed: false });
    expect(activeItemId(s)).toBe(a);
  });

  it('deleting a folder archives what was inside', () => {
    let [s, [a, b]] = setup(2);
    let f: string;
    [s, f] = run(s, (d) => createFolder(d, { items: [a, b], now: T0 }));
    let n: number;
    [s, n] = run(s, (d) => deleteFolder(d, f, T0 + 1));
    expect(n).toBe(2);
    expect(s.items[f]).toBeUndefined();
    expect(s.items[a]).toBeUndefined();
    expect(s.archive.map((e) => e.url).sort()).toEqual(['https://s0.com', 'https://s1.com']);
  });

  it('ungrouping keeps the contents in place', () => {
    let [s, [a, b, c]] = setup(3, true); // pinned: a, b, c
    let f: string;
    [s, f] = run(s, (d) => createFolder(d, { items: [b, c], now: T0 }));
    expect(s.spaces[0].pinned).toEqual([a, f]);
    [s] = run(s, (d) => ungroupFolder(d, f));
    expect(s.spaces[0].pinned).toEqual([a, b, c]);
  });
});

describe('drag and drop', () => {
  it('reorders within a list (down and up)', () => {
    let [s, [a, b, c]] = setup(3, true);
    [s] = run(s, (d) => dropItem(d, a, { type: 'after', id: c }));
    expect(s.spaces[0].pinned).toEqual([b, c, a]);
    [s] = run(s, (d) => dropItem(d, a, { type: 'before', id: b }));
    expect(s.spaces[0].pinned).toEqual([a, b, c]);
    [s] = run(s, (d) => dropItem(d, c, { type: 'before', id: b }));
    expect(s.spaces[0].pinned).toEqual([a, c, b]);
  });

  it('Today → Pinned pins, Pinned → Today unpins', () => {
    let [s, [a, b]] = setup(2); // today: b, a
    [s] = run(s, (d) => dropItem(d, a, { type: 'end', list: 'pinned', spaceId: d.activeSpaceId }));
    expect(s.spaces[0].pinned).toEqual([a]);
    expect(s.items[a]).toMatchObject({ homeUrl: 'https://s0.com' });
    [s] = run(s, (d) => dropItem(d, a, { type: 'before', id: b }));
    expect(s.spaces[0].today).toEqual([a, b]);
    expect((s.items[a] as { homeUrl?: string }).homeUrl).toBeUndefined();
  });

  it('drops into a folder and out again', () => {
    let [s, [a, b]] = setup(2, true);
    let f: string;
    [s, f] = run(s, (d) => createFolder(d, { now: T0 }));
    [s] = run(s, (d) => dropItem(d, a, { type: 'into', folderId: f }));
    expect(s.items[f]).toMatchObject({ children: [a] });
    [s] = run(s, (d) => dropItem(d, b, { type: 'before', id: a }));
    expect(s.items[f]).toMatchObject({ children: [b, a] });
    [s] = run(s, (d) => dropItem(d, a, { type: 'end', list: 'pinned', spaceId: d.activeSpaceId }));
    expect(s.spaces[0].pinned).toEqual([f, a]);
  });

  it('refuses impossible drops', () => {
    let [s, [a]] = setup(1, true);
    let f: string, g: string;
    [s, f] = run(s, (d) => createFolder(d, { now: T0 }));
    [s, g] = run(s, (d) => createFolder(d, { parentId: f, now: T0 }));
    const before = s;
    let ok: boolean;
    [s, ok] = run(s, (d) => dropItem(d, f, { type: 'into', folderId: g })); // into own child
    expect(ok).toBe(false);
    [s, ok] = run(s, (d) => dropItem(d, f, { type: 'into', folderId: f })); // into itself
    expect(ok).toBe(false);
    [s, ok] = run(s, (d) => dropItem(d, f, { type: 'end', list: 'today', spaceId: d.activeSpaceId })); // folders stay pinned
    expect(ok).toBe(false);
    [s, ok] = run(s, (d) => dropItem(d, f, { type: 'end', list: 'favorites', spaceId: null })); // only tabs in favorites
    expect(ok).toBe(false);
    [s, ok] = run(s, (d) => dropItem(d, a, { type: 'before', id: a }));
    expect(ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('drops into Favorites at a position', () => {
    let [s, [a, b, c]] = setup(3);
    [s] = run(s, (d) => addFavorite(d, a));
    [s] = run(s, (d) => addFavorite(d, b));
    [s] = run(s, (d) => dropItem(d, c, { type: 'before', id: b }));
    expect(s.favorites).toEqual([a, c, b]);
  });

  it('drops onto another Space keep the same section', () => {
    let [s, [a, b]] = setup(2);
    [s] = run(s, (d) => pinItem(d, b));
    [s] = run(s, (d) => {
      d.spaces.push({ ...d.spaces[0], id: 'sp2', name: 'Two', pinned: [], today: [] });
    });
    [s] = run(s, (d) => dropItem(d, a, { type: 'space', spaceId: 'sp2' }));
    [s] = run(s, (d) => dropItem(d, b, { type: 'space', spaceId: 'sp2' }));
    expect(s.spaces[1].today).toEqual([a]);
    expect(s.spaces[1].pinned).toEqual([b]);
    expect(s.spaces[0].today).toEqual([]);
  });
});

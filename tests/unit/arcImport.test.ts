import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArc, importArc, extractColors, countNodes } from '@shared/arcImport';
import { findStale } from '@shared/archive';
import { loadState } from '@shared/persistence';
import { HOUR } from '@shared/defaults';
import { fresh, run, T0 } from './helpers';
import type { FolderItem, SplitItem, TabItem } from '@shared/types';

const A = readFileSync(join(__dirname, '../fixtures/arc-sidebar.json'), 'utf8');
const B = readFileSync(join(__dirname, '../fixtures/arc-sidebar-legacy.json'), 'utf8');

describe('parseArc', () => {
  const data = parseArc(A);

  it('reads Spaces with names, emoji and colors', () => {
    expect(data.spaces.map((s) => s.name)).toEqual(['Work', 'Arc Space 2']);
    expect(data.spaces[0].icon).toBe('💼');
    expect(data.spaces[1].icon).toBe('✦'); // non-emoji icon falls back
    expect(data.spaces[0].colors).toEqual(['#3366cc', '#1a3380']);
    expect(data.spaces[1].colors).toBeNull();
  });

  it('reads pinned and today lists in order, regardless of container order', () => {
    expect(data.spaces[0].pinned.map((n) => n.kind)).toEqual(['tab', 'folder', 'split', 'note']);
    expect(data.spaces[0].today.map((n) => n.title)).toEqual(['Hacker News', 'https://example.org/page']);
    expect(data.spaces[1].pinned.map((n) => n.title)).toEqual(['Calendar']); // easel skipped
    expect(data.spaces[1].today.map((n) => n.title)).toEqual(['Video']); // javascript: link skipped
  });

  it('keeps nested folders and split views', () => {
    const folder = data.spaces[0].pinned[1];
    expect(folder).toMatchObject({ kind: 'folder', title: 'Design' });
    expect(folder.children!.map((c) => c.title)).toEqual(['Figma', 'Inspiration']);
    expect(folder.children![1].children![0]).toMatchObject({ kind: 'tab', url: 'https://dribbble.com/shots' });
    expect(data.spaces[0].pinned[2]).toMatchObject({ kind: 'split', orientation: 'row' });
    expect(data.spaces[0].pinned[2].children).toHaveLength(2);
  });

  it('uses the saved title when the item has none', () => {
    expect(data.spaces[0].pinned[1].children![0].title).toBe('Figma');
  });

  it('reads Favorites and reports what it skipped', () => {
    expect(data.favorites.map((f) => f.url)).toEqual(['https://mail.example.com', 'https://open.spotify.com']);
    expect(data.skipped.map((x) => x.reason).sort()).toEqual(['Easel (not supported)', 'unsupported link']);
  });

  it('reads the older sidebarSyncState layout too', () => {
    const b = parseArc(B);
    expect(b.spaces).toHaveLength(1);
    expect(b.spaces[0]).toMatchObject({ name: 'Old Space', icon: '🦊' });
    expect(b.spaces[0].pinned[0]).toMatchObject({ url: 'https://kagi.com' });
    expect(b.spaces[0].today[0]).toMatchObject({ url: 'https://lobste.rs' });
  });

  it('gives clear errors for wrong files', () => {
    expect(() => parseArc('{nope')).toThrow(/valid JSON/);
    expect(() => parseArc('[]')).toThrow(/doesn’t look like/);
    expect(() => parseArc('{"a":1}')).toThrow(/No Spaces or tabs/);
  });

  it('never loops forever on items that list each other as children', () => {
    const loop = JSON.parse(A);
    const items = loop.sidebar.containers[1].items;
    const folder = items.find((x: any) => x?.id === 'f-inner');
    folder.childrenIds.push('f-design');
    expect(() => parseArc(JSON.stringify(loop))).not.toThrow();
  });

  it('counts nodes for the preview', () => {
    expect(countNodes(data.spaces[0].pinned)).toEqual({ tabs: 5, folders: 2, notes: 1 });
  });
});

describe('extractColors', () => {
  it('finds colors anywhere and ignores junk', () => {
    expect(extractColors({ a: [{ b: { red: 1, green: 0, blue: 0 } }] })).toEqual(['#ff0000', '#ff0000']);
    expect(extractColors({ red: 'x' })).toBeNull();
    expect(extractColors(null)).toBeNull();
  });
});

describe('importArc', () => {
  it('adds Spaces alongside existing ones with tabs, folders, splits, notes and favorites', () => {
    let s = fresh();
    let sum: ReturnType<typeof importArc>;
    [s, sum] = run(s, (d) => importArc(d, parseArc(A), { now: T0, tidy: true }));
    expect(s.spaces.map((x) => x.name)).toEqual(['Home', 'Work', 'Arc Space 2']);
    expect(sum).toMatchObject({ spaces: 2, folders: 2, notes: 1, splits: 1, favorites: 2, skipped: 2 });
    const work = s.spaces[1];
    expect(work.icon).toBe('💼');
    expect(work.theme.colors).toEqual(['#3366cc', '#1a3380']);
    const gh = s.items[work.pinned[0]] as TabItem;
    expect(gh).toMatchObject({ url: 'https://github.com/my-org', homeUrl: 'https://github.com/my-org' });
    expect(gh.customTitle).toBe('my-org'); // tidied
    const design = s.items[work.pinned[1]] as FolderItem;
    expect(design.children).toHaveLength(2);
    expect((s.items[design.children[1]] as FolderItem).children).toHaveLength(1);
    const split = s.items[work.pinned[2]] as SplitItem;
    expect(split.panes).toHaveLength(2);
    expect(s.items[work.pinned[3]].kind).toBe('note');
    expect(s.favorites).toHaveLength(2);
    expect((s.items[work.today[0]] as TabItem).homeUrl).toBeUndefined();
  });

  it('imported Today tabs are not archived straight away', () => {
    let s = fresh();
    [s] = run(s, (d) => importArc(d, parseArc(A), { now: T0 }));
    expect(findStale(s, T0 + HOUR)).toEqual([]);
    expect(findStale(s, T0 + 13 * HOUR).length).toBeGreaterThan(0);
  });

  it('imports only the chosen Spaces, can skip Favorites, and avoids duplicate Favorites', () => {
    let s = fresh();
    [s] = run(s, (d) => importArc(d, parseArc(A), { now: T0, spaceIds: ['space-life'], includeFavorites: false }));
    expect(s.spaces.map((x) => x.name)).toEqual(['Home', 'Arc Space 2']);
    expect(s.favorites).toEqual([]);
    [s] = run(s, (d) => importArc(d, parseArc(A), { now: T0, spaceIds: [] }));
    [s] = run(s, (d) => importArc(d, parseArc(A), { now: T0, spaceIds: [] }));
    expect(s.favorites).toHaveLength(2);
  });

  it('result passes Kite’s own state repair untouched', () => {
    let s = fresh();
    [s] = run(s, (d) => importArc(d, parseArc(A), { now: T0 }));
    const back = loadState(JSON.parse(JSON.stringify(s)));
    expect(Object.keys(back.items).length).toBe(Object.keys(s.items).length);
    expect(back.spaces).toEqual(s.spaces);
  });
});

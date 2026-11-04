import { describe, expect, it } from 'vitest';
import { archiveItem, clearToday, findStale, groupArchive, restoreArchived, runAutoArchive, archiveAfterFor, deleteArchived, clearArchive } from '@shared/archive';
import { newTab, pinItem, addFavorite, select } from '@shared/ops';
import { createSpace, updateSpace } from '@shared/spaces';
import { HOUR, DAY } from '@shared/defaults';
import { fresh, run, T0 } from './helpers';

describe('auto-archive', () => {
  it('archives Today tabs unused for longer than the setting (default 12 hours)', () => {
    let s = fresh();
    let old: string, recent: string, current: string;
    [s, old] = run(s, (d) => newTab(d, { url: 'https://old.com', now: T0 }));
    [s, recent] = run(s, (d) => newTab(d, { url: 'https://recent.com', now: T0 + 11 * HOUR }));
    [s, current] = run(s, (d) => newTab(d, { url: 'https://current.com', now: T0 }));
    // current is the selected tab: never archived even though it's old
    expect(findStale(s, T0 + 12 * HOUR)).toEqual([old]);
    let n: number;
    [s, n] = run(s, (d) => runAutoArchive(d, T0 + 12 * HOUR));
    expect(n).toBe(1);
    expect(s.spaces[0].today).toEqual([current, recent]);
    expect(s.archive[0]).toMatchObject({ url: 'https://old.com', reason: 'auto' });
  });

  it('never touches pinned tabs or favorites', () => {
    let s = fresh();
    let a: string, b: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => pinItem(d, a));
    [s] = run(s, (d) => addFavorite(d, b));
    [s] = run(s, (d) => select(d, null, T0));
    expect(findStale(s, T0 + 30 * DAY)).toEqual([]);
  });

  it('"never" turns it off; a Space can override the global time', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.settings.archiveAfterMs = null;
    });
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => select(d, null, T0));
    expect(findStale(s, T0 + 365 * DAY)).toEqual([]);
    [s] = run(s, (d) => updateSpace(d, d.spaces[0].id, { archiveAfterMs: HOUR }));
    expect(archiveAfterFor(s, s.spaces[0].id)).toBe(HOUR);
    expect(findStale(s, T0 + HOUR)).toEqual([a]);
  });

  it('works per Space with each Space’s own time', () => {
    let s = fresh();
    let a: string, b: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => select(d, null, T0));
    [s] = run(s, (d) => createSpace(d, { name: 'Fast' }));
    [s] = run(s, (d) => updateSpace(d, d.activeSpaceId, { archiveAfterMs: HOUR }));
    [s, b] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => select(d, null, T0));
    expect(findStale(s, T0 + 2 * HOUR)).toEqual([b]);
    expect(findStale(s, T0 + 13 * HOUR).sort()).toEqual([a, b].sort());
  });

  it('using a tab resets its clock', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    [s] = run(s, (d) => newTab(d, { url: 'https://b.com', now: T0 }));
    [s] = run(s, (d) => select(d, a, T0 + 10 * HOUR));
    [s] = run(s, (d) => select(d, null, T0 + 10 * HOUR));
    expect(findStale(s, T0 + 13 * HOUR)).not.toContain(a);
  });
});

describe('archive', () => {
  it('Clear archives all of Today in one Space', () => {
    let s = fresh();
    for (const u of ['a', 'b', 'c']) [s] = run(s, (d) => newTab(d, { url: `https://${u}.com`, now: T0 }));
    let n: number;
    [s, n] = run(s, (d) => clearToday(d, d.spaces[0].id, T0));
    expect(n).toBe(3);
    expect(s.spaces[0].today).toEqual([]);
    expect(s.archive.every((e) => e.reason === 'cleared')).toBe(true);
    expect(s.activeBySpace[s.spaces[0].id]).toBeNull();
  });

  it('restores a page as a new tab at the top of Today and removes it from the Archive', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', title: 'A', now: T0 }));
    [s] = run(s, (d) => archiveItem(d, a, T0));
    let id: string | null;
    [s, id] = run(s, (d) => restoreArchived(d, d.archive[0].id, T0 + 1));
    expect(s.items[id!]).toMatchObject({ url: 'https://a.com', title: 'A' });
    expect(s.spaces[0].today).toEqual([id]);
    expect(s.archive).toEqual([]);
  });

  it('restores notes with their content', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.items.n = { id: 'n', kind: 'note', title: 'Ideas', html: '<p>hi</p>', createdAt: 0, updatedAt: 0, lastActiveAt: 0 };
      d.spaces[0].today.push('n');
    });
    [s] = run(s, (d) => archiveItem(d, 'n', T0));
    expect(s.archive[0]).toMatchObject({ kind: 'note', html: '<p>hi</p>' });
    let id: string | null;
    [s, id] = run(s, (d) => restoreArchived(d, d.archive[0].id, T0));
    expect(s.items[id!]).toMatchObject({ kind: 'note', title: 'Ideas', html: '<p>hi</p>' });
  });

  it('restores into the active Space if the original one is gone', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.archive.push({ id: 'e', title: 'x', url: 'https://x.com', kind: 'tab', spaceId: 'deleted', archivedAt: T0, reason: 'auto' });
    });
    [s] = run(s, (d) => restoreArchived(d, 'e', T0));
    expect(s.spaces[0].today).toHaveLength(1);
  });

  it('deletes single entries and clears everything', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.archive.push({ id: 'e1', title: 'x', url: 'u', kind: 'tab', spaceId: 's', archivedAt: T0, reason: 'auto' });
      d.archive.push({ id: 'e2', title: 'y', url: 'u', kind: 'tab', spaceId: 's', archivedAt: T0, reason: 'auto' });
    });
    [s] = run(s, (d) => deleteArchived(d, 'e1'));
    expect(s.archive.map((e) => e.id)).toEqual(['e2']);
    [s] = run(s, (d) => clearArchive(d));
    expect(s.archive).toEqual([]);
  });

  it('groups by day and filters by text', () => {
    const now = new Date(2026, 10, 4, 15).getTime();
    const e = (id: string, t: number, title: string) => ({ id, title, url: `https://${title}.com`, kind: 'tab' as const, spaceId: 's', archivedAt: t, reason: 'auto' as const });
    const entries = [e('1', now - HOUR, 'alpha'), e('2', now - DAY, 'beta'), e('3', now - 3 * DAY, 'gamma')];
    const groups = groupArchive(entries, now);
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(groups).toHaveLength(3);
    expect(groupArchive(entries, now, 'bet')).toEqual([{ label: 'Yesterday', items: [entries[1]] }]);
  });
});

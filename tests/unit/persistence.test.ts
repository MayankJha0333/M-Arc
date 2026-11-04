import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, serialize } from '@shared/persistence';
import { newTab } from '@shared/ops';
import { Storage } from '../../src/main/storage';
import { fresh, run, T0 } from './helpers';

describe('loadState', () => {
  it('gives a fresh state for nothing or junk', () => {
    for (const raw of [null, undefined, 42, 'x', [], { spaces: [] }]) {
      const s = loadState(raw);
      expect(s.spaces).toHaveLength(1);
      expect(s.activeSpaceId).toBe(s.spaces[0].id);
    }
  });

  it('round-trips a real state', () => {
    let s = fresh();
    [s] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    const back = loadState(JSON.parse(serialize(s)));
    expect(back.items).toEqual(s.items);
    expect(back.spaces[0].today).toEqual(s.spaces[0].today);
  });

  it('fills settings added in newer versions and keeps custom ones', () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    delete raw.settings.radius;
    raw.settings.sidebarWidth = 333;
    raw.settings.shortcuts = { commandBar: 'mod+k' };
    const back = loadState(raw);
    expect(back.settings.radius).toBe(12);
    expect(back.settings.sidebarWidth).toBe(333);
    expect(back.settings.shortcuts.commandBar).toBe('mod+k');
    expect(back.settings.shortcuts.closeTab).toBe('mod+w');
  });

  it('repairs broken references', () => {
    let s = fresh();
    let a: string;
    [s, a] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    const raw = JSON.parse(serialize(s));
    raw.spaces[0].today.push('missing', a); // dangling + duplicate
    raw.items.orphan = { id: 'orphan', kind: 'tab', url: 'https://o.com', title: 'o', createdAt: 0, lastActiveAt: 0 };
    raw.activeBySpace[raw.spaces[0].id] = 'missing';
    raw.activeSpaceId = 'nope';
    raw.favorites = [a];
    const back = loadState(raw);
    expect(back.favorites).toEqual([a]);
    expect(back.spaces[0].today).toEqual([]);
    expect(back.items.orphan).toBeUndefined();
    expect(back.activeSpaceId).toBe(back.spaces[0].id);
    expect(back.activeBySpace[back.spaces[0].id]).toBeNull();
  });

  it('drops folders from Today and split views with fewer than 2 panes', () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    raw.items.f = { id: 'f', kind: 'folder', title: 'F', children: [], collapsed: false, createdAt: 0 };
    raw.items.t = { id: 't', kind: 'tab', url: 'https://t.com', title: 't', createdAt: 0, lastActiveAt: 0 };
    raw.items.sp = { id: 'sp', kind: 'split', panes: ['t'], orientation: 'row', sizes: [1], focused: 0, createdAt: 0, lastActiveAt: 0 };
    raw.spaces[0].today = ['f', 'sp'];
    const back = loadState(raw);
    expect(back.spaces[0].today).toEqual([]);
  });
});

describe('Storage (disk)', () => {
  it('writes atomically, keeps a backup, and falls back to it if the file is broken', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kite-'));
    const st = new Storage(dir);
    expect(st.load()).toBeNull();
    st.save('{"v":1}');
    st.save('{"v":2}');
    expect(st.load()).toEqual({ v: 2 });
    expect(JSON.parse(readFileSync(st.backup, 'utf8'))).toEqual({ v: 1 });
    writeFileSync(st.file, '{broken');
    expect(st.load()).toEqual({ v: 1 });
    expect(existsSync(`${st.file}.tmp`)).toBe(false);
  });

  it('refuses to write invalid JSON', () => {
    const st = new Storage(mkdtempSync(join(tmpdir(), 'kite-')));
    expect(() => st.save('{nope')).toThrow();
    expect(st.load()).toBeNull();
  });
});

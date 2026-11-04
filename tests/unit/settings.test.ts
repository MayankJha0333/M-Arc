import { describe, expect, it } from 'vitest';
import { clearHistory, exportBackup, readBackup, resetAppearance, resetShortcuts, setShortcut, shortcutConflict, updateSettings } from '@shared/settings';
import { DEFAULT_SHORTCUTS } from '@shared/defaults';
import { newTab } from '@shared/ops';
import { themeVars, contrast, mix } from '../../src/renderer/theme';
import { fresh, run, T0 } from './helpers';

describe('settings', () => {
  it('keeps numbers within limits and rejects bad search templates', () => {
    let s = fresh();
    [s] = run(s, (d) => updateSettings(d, { sidebarWidth: 9999, fontScale: 0.1, radius: -4, gap: 12.6, favoritesColumns: 10 }));
    expect(s.settings).toMatchObject({ sidebarWidth: 440, fontScale: 0.85, radius: 0, gap: 13, favoritesColumns: 6 });
    [s] = run(s, (d) => updateSettings(d, { sidebarWidth: NaN }));
    expect(s.settings.sidebarWidth).toBe(264);
    const before = s.settings.searchEngine;
    [s] = run(s, (d) => updateSettings(d, { searchEngine: 'https://no-placeholder.com' }));
    expect(s.settings.searchEngine).toBe(before);
    [s] = run(s, (d) => updateSettings(d, { searchEngine: 'javascript:%s' }));
    expect(s.settings.searchEngine).toBe(before);
    [s] = run(s, (d) => updateSettings(d, { searchEngine: 'https://search.example/?q=%s' }));
    expect(s.settings.searchEngine).toBe('https://search.example/?q=%s');
  });

  it('reset appearance keeps other choices', () => {
    let s = fresh();
    [s] = run(s, (d) => updateSettings(d, { sidebarSide: 'right', radius: 2, archiveAfterMs: null, chromeCss: 'x{}' }));
    [s] = run(s, (d) => resetAppearance(d));
    expect(s.settings).toMatchObject({ sidebarSide: 'left', radius: 12, chromeCss: '', archiveAfterMs: null });
  });
});

describe('shortcuts', () => {
  it('detects conflicts and moves a shortcut from the other action', () => {
    let s = fresh();
    expect(shortcutConflict(s, 'newNote', 'mod+t')).toBe('commandBar');
    let cleared: string | null;
    [s, cleared] = run(s, (d) => setShortcut(d, 'newNote', 'mod+t'));
    expect(cleared).toBe('commandBar');
    expect(s.settings.shortcuts).toMatchObject({ newNote: 'mod+t', commandBar: '' });
  });

  it('the little window shortcut is also the global hotkey', () => {
    let s = fresh();
    [s] = run(s, (d) => setShortcut(d, 'littleWindow', 'mod+shift+l'));
    expect(s.settings.littleHotkey).toBe('mod+shift+l');
  });

  it('resets one or all', () => {
    let s = fresh();
    [s] = run(s, (d) => setShortcut(d, 'newNote', 'mod+t'));
    [s] = run(s, (d) => resetShortcuts(d, 'commandBar'));
    expect(s.settings.shortcuts.commandBar).toBe('mod+t');
    expect(s.settings.shortcuts.newNote).toBe(''); // gave its keys back
    [s] = run(s, (d) => resetShortcuts(d));
    expect(s.settings.shortcuts).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe('backup', () => {
  it('round-trips everything and rejects other files', () => {
    let s = fresh();
    [s] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    const back = readBackup(exportBackup(s));
    expect(back.state.items).toEqual(s.items);
    expect(back.state.spaces).toEqual(s.spaces);
    expect(back).toMatchObject({ spaces: 1, tabs: 1, notes: 0, boosts: 0, scriptsRemoved: 0 });
    expect(() => readBackup('{"kind":"other"}')).toThrow(/isn’t a Kite backup/);
    expect(() => readBackup('garbage')).toThrow(/isn’t a Kite backup/);
    expect(() => readBackup('{"kind":"kite-backup","state":null}')).toThrow(/isn’t a Kite backup/);
    expect(() => readBackup('{"kind":"kite-backup","state":{"hello":1}}')).toThrow(/damaged or empty/);
  });

  it('restoring never brings Boost scripts in', () => {
    let s = fresh();
    [s] = run(s, (d) => {
      d.boosts.push({ id: 'b', name: 'x', domain: 'bank.example', enabled: true, css: 'p{}', js: 'steal()', zaps: [], createdAt: 0, updatedAt: 0 });
    });
    const back = readBackup(exportBackup(s));
    expect(back.scriptsRemoved).toBe(1);
    expect(back.state.boosts[0]).toMatchObject({ css: 'p{}', js: '' });
  });

  it('clears history', () => {
    let s = fresh();
    [s] = run(s, (d) => newTab(d, { url: 'https://a.com', now: T0 }));
    expect(s.history).toHaveLength(1);
    [s] = run(s, (d) => clearHistory(d));
    expect(s.history).toEqual([]);
  });
});

describe('theme colors', () => {
  it('accent stays readable on the sidebar for every preset, light and dark', () => {
    const s = fresh();
    for (const colors of [['#f2c9a0', '#e58f65'], ['#fbe38e', '#f29e4c'], ['#3a4256', '#141824'], ['#ffffff', '#ffffff']] as [string, string][]) {
      for (const mode of ['light', 'dark'] as const) {
        const v = themeVars({ colors, mode, intensity: 0.55, grain: true }, s.settings, false);
        expect(contrast(v['--accent'], v['--chrome-mid'])).toBeGreaterThanOrEqual(2.9);
      }
    }
  });
  it('mixes colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

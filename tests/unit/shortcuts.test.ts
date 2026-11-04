import { describe, expect, it } from 'vitest';
import { findAction, formatShortcut, matchesShortcut, parseShortcut, shortcutFromEvent, toAccelerator } from '@shared/shortcuts';
import { DEFAULT_SHORTCUTS } from '@shared/defaults';

const ev = (key: string, mods: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {}, code?: string) => ({
  key, code, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift,
});

describe('shortcuts', () => {
  it('parses', () => {
    expect(parseShortcut('mod+shift+t')).toMatchObject({ mod: true, shift: true, key: 't' });
    expect(parseShortcut('mod++')).toMatchObject({ mod: true, key: '+' });
    expect(parseShortcut('')).toBeNull();
  });
  it('mod means cmd on mac and ctrl elsewhere', () => {
    expect(matchesShortcut(ev('t', { meta: true }), 'mod+t', true)).toBe(true);
    expect(matchesShortcut(ev('t', { ctrl: true }), 'mod+t', true)).toBe(false);
    expect(matchesShortcut(ev('t', { ctrl: true }), 'mod+t', false)).toBe(true);
  });
  it('extra modifiers do not match', () => {
    expect(matchesShortcut(ev('t', { meta: true, shift: true }), 'mod+t', true)).toBe(false);
  });
  it('uses physical key codes so shift/option symbols still match', () => {
    expect(matchesShortcut(ev('+', { meta: true, shift: true }, 'Equal'), 'mod+shift+=', true)).toBe(true);
    expect(matchesShortcut(ev('Ã', { meta: true, alt: true }, 'KeyN'), 'mod+alt+n', true)).toBe(true);
    expect(matchesShortcut(ev('ArrowRight', { meta: true, alt: true }, 'ArrowRight'), 'mod+alt+arrowright', true)).toBe(true);
  });
  it('finds actions from defaults', () => {
    expect(findAction(ev('t', { meta: true }, 'KeyT'), DEFAULT_SHORTCUTS, true)).toBe('commandBar');
    expect(findAction(ev('T', { meta: true, shift: true }, 'KeyT'), DEFAULT_SHORTCUTS, true)).toBe('reopenClosed');
    expect(findAction(ev('x', {}), DEFAULT_SHORTCUTS, true)).toBeNull();
  });
  it('defaults have no duplicates', () => {
    const vals = Object.values(DEFAULT_SHORTCUTS);
    expect(new Set(vals).size).toBe(vals.length);
  });
  it('records shortcuts from key presses', () => {
    expect(shortcutFromEvent(ev('k', { meta: true, shift: true }, 'KeyK'), true)).toBe('mod+shift+k');
    expect(shortcutFromEvent(ev('k', {}, 'KeyK'), true)).toBeNull();
    expect(shortcutFromEvent(ev('Meta', { meta: true }), true)).toBeNull();
    expect(shortcutFromEvent(ev('f5', {}), false)).toBe('f5');
  });
  it('formats', () => {
    expect(formatShortcut('mod+shift+t', true)).toBe('⇧⌘T');
    expect(formatShortcut('mod+shift+t', false)).toBe('Ctrl+Shift+T');
    expect(formatShortcut('mod+alt+arrowright', true)).toBe('⌥⌘→');
  });
  it('converts to Electron accelerators', () => {
    expect(toAccelerator('mod+alt+n')).toBe('CommandOrControl+Alt+N');
    expect(toAccelerator('ctrl+shift+arrowleft')).toBe('Control+Shift+Left');
  });
});

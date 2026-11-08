import { describe, expect, it } from 'vitest';
import { floatingFlags, isPipWindow, needsFloating, NS, type NativeWindowInfo } from '@shared/pipWindow';

const win = (o: Partial<NativeWindowInfo> = {}): NativeWindowInfo => ({
  addr: 100,
  className: 'NativeWidgetMacFramelessNSWindow',
  level: NS.FloatingLevel,
  visible: true,
  styleMask: 0,
  behavior: NS.MoveToActiveSpace,
  ...o,
});

describe('finding the floating video window (macOS)', () => {
  it('picks the visible floating Chromium window', () => {
    expect(isPipWindow(win(), new Set())).toBe(true);
    expect(isPipWindow(win({ className: 'NativeWidgetMacNSWindow' }), new Set())).toBe(true);
  });

  it('never touches Kite’s own windows, hidden windows, or other kinds of windows', () => {
    expect(isPipWindow(win(), new Set([100]))).toBe(false);
    expect(isPipWindow(win({ visible: false }), new Set())).toBe(false);
    expect(isPipWindow(win({ className: 'ElectronNSWindow' }), new Set())).toBe(false);
    expect(isPipWindow(win({ level: 0 }), new Set())).toBe(false); // a normal window
    expect(isPipWindow(win({ level: 101 }), new Set())).toBe(false); // a menu
  });

  it('still recognises a window it already turned into a panel', () => {
    expect(isPipWindow(win({ level: NS.PanelLevel, styleMask: NS.NonactivatingPanel }), new Set())).toBe(true);
    expect(isPipWindow(win({ level: NS.PanelLevel, styleMask: 0 }), new Set())).toBe(false);
  });
});

describe('turning it into a panel', () => {
  it('adds "float over full-screen apps" and "show on every desktop"', () => {
    const f = floatingFlags(1 | 2, NS.MoveToActiveSpace | 4);
    expect(f.styleMask & NS.NonactivatingPanel).toBeTruthy();
    expect(f.styleMask & 3).toBe(3); // keeps existing flags
    expect(f.behavior & NS.CanJoinAllSpaces).toBeTruthy();
    expect(f.behavior & NS.FullScreenAuxiliary).toBeTruthy();
    expect(f.behavior & NS.MoveToActiveSpace).toBe(0); // can't be combined with "every desktop"
    expect(f.behavior & 4).toBe(4);
  });

  it('is done only once', () => {
    const w = win();
    expect(needsFloating(w)).toBe(true);
    const f = floatingFlags(w.styleMask, w.behavior);
    expect(needsFloating({ ...w, ...f, level: NS.PanelLevel })).toBe(false);
  });
});

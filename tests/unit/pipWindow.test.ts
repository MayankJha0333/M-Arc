import { describe, expect, it } from 'vitest';
import { isPipWindow, isVideoWindowSetup, NS, type NativeWindowInfo } from '@shared/pipWindow';

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
});

describe('recognising the video window while Chromium sets it up', () => {
  const base = { className: 'NSKVONotifying_NativeWidgetMacFramelessNSWindow', level: NS.FloatingLevel, behavior: 37 };
  it('matches the floating, every-desktop, frameless window', () => {
    expect(isVideoWindowSetup(base)).toBe(true);
    expect(isVideoWindowSetup({ ...base, className: 'NativeWidgetMacFramelessNSWindow' })).toBe(true);
  });
  it('ignores Kite’s windows, normal windows and windows not on every desktop', () => {
    expect(isVideoWindowSetup({ ...base, className: 'ElectronNSWindow' })).toBe(false);
    expect(isVideoWindowSetup({ ...base, level: 0 })).toBe(false);
    expect(isVideoWindowSetup({ ...base, behavior: 4 | 32 })).toBe(false);
  });
});

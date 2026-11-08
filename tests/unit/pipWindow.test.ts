import { describe, expect, it } from 'vitest';
import { isPipWindow, NS, type NativeWindowInfo } from '@shared/pipWindow';

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

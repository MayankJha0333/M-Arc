// macOS only: make the floating video window behave like a panel, so it follows
// you to every desktop, including another app's full-screen Space (where normal
// windows can't go). Pure helpers; src/main/macWindows.ts does the native calls.

/** Values from macOS's AppKit (NSWindow). */
export const NS = {
  /** Style flag that lets a window float over full-screen apps without stealing focus. */
  NonactivatingPanel: 1 << 7,
  /** Collection behaviour: show on every desktop… */
  CanJoinAllSpaces: 1 << 0,
  /** …which can't be combined with "move to the desktop you're on". */
  MoveToActiveSpace: 1 << 1,
  /** …and be allowed on top of a full-screen app's Space. */
  FullScreenAuxiliary: 1 << 8,
  /** Window level Chromium uses for the floating video. */
  FloatingLevel: 3,
} as const;

export interface NativeWindowInfo {
  addr: number;
  className: string;
  level: number;
  visible: boolean;
  styleMask: number;
  behavior: number;
}

/**
 * Is this the floating video window? It's a visible Chromium window (not one of
 * Kite's own windows) at the "floating" level.
 */
export function isPipWindow(w: NativeWindowInfo, ours: ReadonlySet<number>): boolean {
  if (ours.has(w.addr) || !w.visible || !/NativeWidgetMac/.test(w.className)) return false;
  return w.level === NS.FloatingLevel;
}

// Kite's frame around the floating video: a see-through panel window laid exactly
// over Chromium's video window, drawing a border and Back / Minimize / Close.
// Clicks pass straight through to the video except on Kite's buttons.
// The video window itself is found and moved through macWindows.ts (macOS only).

import { BrowserWindow, screen } from 'electron';
import { compactBounds, fromCocoa, isCompact, toCocoa, type PipFrameAction, type Rect } from '../shared/pipFrame';

export const FRAME_RADIUS = 12;

export interface PipFrameDeps {
  log(msg: string): void;
  url(): string;
  webPreferences(): Electron.WebPreferences;
  native: {
    find(): { addr: number; frame: Rect } | null;
    setFrame(addr: number, cocoaFrame: Rect): void;
    round(addr: number, radius: number): void;
    attach(addr: number, frameWindow: BrowserWindow): boolean;
  };
}

const same = (a: Rect | null, b: Rect | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function createPipFrame(deps: PipFrameDeps) {
  let win: BrowserWindow | null = null;
  let pipAddr = 0;
  let bounds: Rect | null = null;
  let restore: Rect | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tries: ReturnType<typeof setTimeout>[] = [];

  const mainScreenHeight = () => screen.getPrimaryDisplay().bounds.height;

  function ensureWindow(): BrowserWindow {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      // A real macOS panel: floats over full-screen apps and never pulls Kite forward.
      type: process.platform === 'darwin' ? 'panel' : undefined,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      title: 'Kite video frame',
      webPreferences: deps.webPreferences(),
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true }); // clicks go to the video until you're on a button
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.loadURL(deps.url());
    win.on('closed', () => (win = null));
    return win;
  }

  function sendState() {
    if (win && !win.isDestroyed() && bounds) win.webContents.send('pip-frame-state', { compact: isCompact(bounds) });
  }

  /** Put the frame over the video window at `cocoaFrame`. */
  function place(addr: number, cocoaFrame: Rect) {
    const w = ensureWindow();
    const fresh = addr !== pipAddr;
    pipAddr = addr;
    bounds = fromCocoa(cocoaFrame, mainScreenHeight());
    w.setBounds(bounds);
    if (fresh) {
      restore = null;
      deps.native.round(addr, FRAME_RADIUS);
      w.showInactive();
      const pinned = deps.native.attach(addr, w);
      deps.log(`frame: shown over the video (${bounds.width}×${bounds.height}${pinned ? ', pinned' : ''})`);
    }
    sendState();
    if (!timer) timer = setInterval(sync, 150);
  }

  /** Follow the video window (resized, moved, closed). */
  function sync() {
    if (!pipAddr) return;
    const p = deps.native.find();
    if (!p || p.addr !== pipAddr) return hide('video window closed');
    const next = fromCocoa(p.frame, mainScreenHeight());
    if (!same(next, bounds)) {
      bounds = next;
      win?.setBounds(next);
      sendState();
    }
  }

  function hide(why: string) {
    for (const t of tries) clearTimeout(t);
    tries = [];
    if (timer) clearInterval(timer);
    timer = null;
    if (pipAddr) deps.log(`frame: hidden (${why})`);
    pipAddr = 0;
    bounds = null;
    restore = null;
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(true, { forward: true });
      win.hide();
    }
  }

  /** The video window appears a moment after the pop-out starts: look a few times. */
  function showSoon() {
    for (const t of tries) clearTimeout(t);
    tries = [0, 150, 400, 900, 1600].map((ms) =>
      setTimeout(() => {
        const p = deps.native.find();
        if (p && p.addr !== pipAddr) place(p.addr, p.frame);
      }, ms),
    );
  }

  /** Minimize: shrink into the nearest corner; again: back to the size it had. */
  function toggleMinimize() {
    if (!pipAddr || !bounds) return;
    const target = restore ?? compactBounds(bounds, screen.getDisplayMatching(bounds).workArea);
    restore = restore ? null : bounds;
    deps.native.setFrame(pipAddr, toCocoa(target, mainScreenHeight()));
    deps.log(`frame: ${restore ? 'minimized' : 'restored'} to ${target.width}×${target.height}`);
    setTimeout(sync, 350); // after the animation
  }

  return {
    showSoon,
    hide,
    toggleMinimize,
    /** Mouse is over one of Kite's buttons: take clicks; otherwise let them through. */
    setHover(over: boolean) {
      win?.setIgnoreMouseEvents(!over, { forward: true });
    },
    isFrameWindow: (w: BrowserWindow | null) => !!w && w === win,
    /** Tests: show the frame at these screen bounds without a real video window. */
    showForTest(b: Rect) {
      const w = ensureWindow();
      bounds = b;
      w.setBounds(b);
      w.showInactive();
      sendState();
      return w;
    },
  };
}

export type PipFrame = ReturnType<typeof createPipFrame>;
export type { PipFrameAction };

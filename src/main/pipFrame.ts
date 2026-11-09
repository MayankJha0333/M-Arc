// Kite's floating video controls (design D): a panel window laid exactly over
// Chromium's video window. Chromium's window is told to ignore the mouse, so its
// own buttons never show; Kite draws Close / Minimize / Back to tab / play, skip and
// a seek slider, moves the video window when you drag it, and resizes it from its
// edges and corners.
//
// Minimize turns the same window into a mini player (the video keeps playing in its
// tab); "Show video" pops it out again.
// The video window itself is found and moved through macWindows.ts (macOS only).

import { BrowserWindow, screen } from 'electron';
import { dragTo, fromCocoa, miniBounds, resizeTo, toCocoa, VIDEO_RADIUS, type PipFrameMode, type PipFrameState, type Rect, type ResizeEdge } from '../shared/pipFrame';

export interface PipMediaInfo {
  t: number;
  d: number;
  paused: boolean;
  pip: boolean;
}

export interface PipFrameDeps {
  log(msg: string): void;
  url(): string;
  webPreferences(): Electron.WebPreferences;
  /** The floating video's playback position, and its page's title and site. */
  media(): Promise<(PipMediaInfo & { title: string; host: string }) | null>;
  /** Mini player: a small snapshot of the video. */
  thumb(): Promise<string | null>;
  native: {
    find(): { addr: number; frame: Rect } | null;
    setFrame(addr: number, cocoaFrame: Rect, animate: boolean): void;
    /** Make the video window ignore the mouse (Kite's controls handle it all). */
    ignoreMouse(addr: number): void;
    /** Re-check that the video window still ignores the mouse; true if it had to be fixed. */
    keepIgnoringMouse(addr: number): boolean;
    /** Round the video window's corners if that's safe; true if it did. */
    round(addr: number, radius: number): boolean;
    /** Run a risky step under the crash safety net (logged; skipped if it crashed last time). */
    step<T>(name: string, fn: () => T, fallback: T): T;
  };
}

const same = (a: Rect | null, b: Rect | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function createPipFrame(deps: PipFrameDeps) {
  let win: BrowserWindow | null = null;
  let mode: PipFrameMode | 'hidden' = 'hidden';
  let pipAddr = 0;
  /** The video window's own bounds (screen coordinates). */
  let pipBounds: Rect | null = null;
  let followTimer: ReturnType<typeof setInterval> | null = null;
  let mediaTimer: ReturnType<typeof setInterval> | null = null;
  let tries: ReturnType<typeof setTimeout>[] = [];
  let drag: { kind: 'move' | ResizeEdge; from: { x: number; y: number }; start: Rect; timer: ReturnType<typeof setInterval>; stopAt: number } | null = null;
  let thumbTimer: ReturnType<typeof setInterval> | null = null;
  let thumb: string | undefined;
  /** Did the video window get rounded corners (then the shade is curved to match)? */
  let rounded = false;
  let last: PipFrameState | null = null;

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
      acceptFirstMouse: true, // the first click on a button works even though Kite is in the background
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      title: 'Kite video controls',
      webPreferences: deps.webPreferences(),
    });
    // One level above the video window, so the controls always stay on top of it.
    // (Not pinned to it as a child window: moving the video from JavaScript would then
    // make macOS move this Electron window mid-call and re-enter JavaScript — a crash.)
    win.setAlwaysOnTop(true, 'floating', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('did-finish-load', () => last && send(last));
    win.loadURL(deps.url());
    win.on('closed', () => (win = null));
    return win;
  }

  function send(state: PipFrameState) {
    last = state;
    if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('pip-frame-state', state);
  }

  let missing = 0;
  async function pollMedia() {
    if (mode === 'hidden') return;
    const m = await deps.media();
    if (!m) {
      // The video's tab was closed or went elsewhere: don't leave stale controls behind.
      if (++missing >= 4) hide('video gone');
      return;
    }
    missing = 0;
    send({ mode: mode === 'mini' ? 'mini' : 'full', t: m.t, d: m.d, paused: m.paused, title: m.title, host: m.host, thumb, rounded });
  }

  async function pollThumb() {
    if (mode !== 'mini') return;
    const t = await deps.thumb();
    if (t && t !== thumb) {
      thumb = t;
      if (last) send({ ...last, thumb });
    }
  }

  function startTimers() {
    if (!followTimer) followTimer = setInterval(follow, 150);
    if (!mediaTimer) mediaTimer = setInterval(() => void pollMedia(), 500);
    void pollMedia();
  }

  function stopTimers() {
    if (followTimer) clearInterval(followTimer);
    if (mediaTimer) clearInterval(mediaTimer);
    if (thumbTimer) clearInterval(thumbTimer);
    followTimer = mediaTimer = thumbTimer = null;
  }

  /** Put the controls over the video window at `cocoaFrame`. */
  function place(addr: number, cocoaFrame: Rect) {
    const outer = fromCocoa(cocoaFrame, mainScreenHeight());
    const inner = outer; // covers the whole video
    if (addr !== pipAddr || mode !== 'full') {
      const w = deps.native.step(
        'create and show',
        () => {
          const bw = ensureWindow();
          bw.setMovable(false);
          bw.setBounds(inner);
          bw.showInactive();
          return bw;
        },
        null,
      );
      if (!w) return;
      pipAddr = addr;
      pipBounds = outer;
      mode = 'full';
      deps.native.step('video window ignores the mouse', () => deps.native.ignoreMouse(addr), undefined);
      rounded = deps.native.step('round the video window', () => deps.native.round(addr, VIDEO_RADIUS), false);
      if (thumbTimer) clearInterval(thumbTimer);
      thumbTimer = null;
      deps.log(`frame: controls shown over the video (${outer.width}×${outer.height})`);
      if (last) send({ ...last, mode: 'full', rounded });
      startTimers();
    } else if (!same(outer, pipBounds)) {
      pipBounds = outer;
      win?.setBounds(inner);
    }
  }

  /** Follow the video window (resized, moved, closed). */
  function follow() {
    if (mode !== 'full' || !pipAddr || drag) return;
    const p = deps.native.find();
    if (!p || p.addr !== pipAddr) return hide('video window closed');
    if (deps.native.keepIgnoringMouse(p.addr)) deps.log('frame: the video window was taking the mouse again — switched off');
    const before = pipBounds;
    place(p.addr, p.frame);
    if (before && pipBounds && (before.width !== pipBounds.width || before.height !== pipBounds.height)) {
      deps.log(`frame: video window resized to ${pipBounds.width}×${pipBounds.height}; controls follow`);
    }
  }

  function hide(why: string) {
    for (const t of tries) clearTimeout(t);
    tries = [];
    endDrag();
    stopTimers();
    if (mode !== 'hidden') deps.log(`frame: hidden (${why})`);
    mode = 'hidden';
    pipAddr = 0;
    pipBounds = null;
    last = null;
    thumb = undefined;
    if (win && !win.isDestroyed()) win.hide();
  }

  /** The video window appears a moment after the pop-out starts: look a few times. */
  function showSoon() {
    for (const t of tries) clearTimeout(t);
    tries = [0, 150, 400, 900, 1600].map((ms) =>
      setTimeout(() => {
        const p = deps.native.find();
        if (p && (p.addr !== pipAddr || mode !== 'full')) place(p.addr, p.frame);
      }, ms),
    );
  }

  /** Minimize: the controls become the mini player in the corner of the same screen. */
  function toMini() {
    const w = win;
    if (!w || w.isDestroyed() || mode === 'hidden') return;
    endDrag();
    const near = pipBounds ?? w.getBounds();
    const bounds = miniBounds(screen.getDisplayMatching(near).workArea);
    pipAddr = 0;
    mode = 'mini';
    w.setBounds(bounds);
    w.setMovable(true); // drag the card itself
    w.showInactive();
    if (last) send({ ...last, mode: 'mini' });
    startTimers();
    void pollThumb();
    if (!thumbTimer) thumbTimer = setInterval(() => void pollThumb(), 4000);
    deps.log('frame: minimized to the mini player');
  }

  /**
   * Drag on the video: move the video window, and the controls with it.
   * Drag an edge or corner: resize it, keeping its shape.
   */
  function startDrag(kind: 'move' | ResizeEdge = 'move') {
    if (mode !== 'full' || !pipAddr || !pipBounds) return;
    endDrag();
    const addr = pipAddr;
    const start = pipBounds;
    const maxWidth = Math.round(screen.getDisplayMatching(start).workArea.width * 0.9);
    drag = {
      kind,
      from: screen.getCursorScreenPoint(),
      start,
      stopAt: Date.now() + 20_000, // never get stuck if the mouse-up is missed
      timer: setInterval(() => {
        if (!drag || Date.now() > drag.stopAt) return endDrag();
        const at = screen.getCursorScreenPoint();
        const next = drag.kind === 'move' ? dragTo(drag.start, drag.from, at) : resizeTo(drag.start, drag.kind, drag.from, at, maxWidth);
        if (same(next, pipBounds)) return;
        pipBounds = next;
        // The video window is Chromium's (moved through macOS); the controls are Kite's own
        // Electron window (moved through Electron) — never one through the other.
        deps.native.setFrame(addr, toCocoa(next, mainScreenHeight()), false);
        win?.setBounds(next);
      }, 16),
    };
  }

  function endDrag() {
    if (drag) clearInterval(drag.timer);
    drag = null;
  }

  return {
    showSoon,
    hide,
    toMini,
    startDrag,
    endDrag,
    /** Refresh the time and play state right after a button press. */
    refresh: () => void pollMedia(),
    mode: () => mode,
    isFrameWindow: (w: BrowserWindow | null) => !!w && w === win,
    /** Tests: show the controls at these screen bounds without a real video window. */
    showForTest(b: Rect) {
      const w = ensureWindow();
      mode = 'full';
      pipBounds = b;
      w.setBounds(b);
      w.showInactive();
      startTimers();
      return w;
    },
  };
}

export type PipFrame = ReturnType<typeof createPipFrame>;

// macOS only: talks to AppKit directly (through koffi, which calls system libraries
// from JavaScript — nothing to compile) to make the floating video window a panel
// that stays on top of every app, including full-screen ones, like Arc does.
// Electron has no setting for Chromium's video window, so this is the only way in.

import { app, BrowserWindow } from 'electron';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPipWindow, isVideoWindowSetup, NS, type NativeWindowInfo } from '../shared/pipWindow';
import type { Rect } from '../shared/pipFrame';
import { installPanelHooks, isPanel, markPanel, type ClassRuntime } from './objcPanel';

type Log = (msg: string) => void;
type Fn = (...args: unknown[]) => unknown;

interface ObjC {
  sel(name: string): number;
  cls(name: string): number;
  className(obj: number): string;
  /** obj.selector() → id / NSUInteger */
  send(obj: number, sel: number): number;
  /** obj.selector(arg) → id */
  sendArg(obj: number, sel: number, arg: number): number;
  sendLevel(obj: number, sel: number): number;
  sendBool(obj: number, sel: number): boolean;
  sendBoolArg(obj: number, sel: number, arg: number): boolean;
  setUInt(obj: number, sel: number, v: number): void;
  setInt(obj: number, sel: number, v: number): void;
  setBool(obj: number, sel: number, v: boolean): void;
  call(obj: number, sel: number): void;
  /** NSWindow -frame (origin bottom-left of the main screen). */
  frame(win: number): Rect;
  /** NSWindow -setFrame:display:animate: */
  setFrame(win: number, r: Rect, animate: boolean): void;
  setDouble(obj: number, sel: number, v: number): void;
  /** For the panel hooks. */
  runtime: ClassRuntime;
}

let objc: ObjC | null | false = null;

// ---- Crash safety nets ----------------------------------------------------------
// This reaches into macOS directly. If a step ever crashes Kite, the next launch of
// the same build skips that step instead of crashing again (a new build tries again).
// Two separate nets: making the video a panel, and Kite's frame around it.

function buildId(): string {
  try {
    return String(statSync(join(__dirname, 'main.cjs')).mtimeMs);
  } catch {
    return app.getVersion();
  }
}

function crashGuard(name: string, what: string) {
  const file = () => join(app.getPath('userData'), name);
  let disabled: boolean | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let quitHooked = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      unlinkSync(file());
    } catch {
      /* already gone */
    }
  };
  return {
    /** Did this step crash Kite last time (same build)? */
    isOff(log: Log): boolean {
      if (disabled !== null) return disabled;
      disabled = false;
      try {
        if (existsSync(file())) {
          if (readFileSync(file(), 'utf8') === buildId()) {
            disabled = true;
            log(`${what}: turned off — Kite closed unexpectedly while doing this last time`);
          } else unlinkSync(file());
        }
      } catch {
        /* ignore */
      }
      return disabled;
    },
    /** About to do the risky step: leave a marker that's cleared if Kite survives it. */
    arm() {
      if (!timer) {
        try {
          writeFileSync(file(), buildId());
        } catch {
          /* ignore */
        }
      }
      if (!quitHooked) app.once('will-quit', clear); // a normal quit is not a crash
      quitHooked = true;
      if (timer) clearTimeout(timer);
      // Survived the change and half a minute of macOS using it (switching apps etc.).
      timer = setTimeout(clear, 30_000);
    },
    clear,
  };
}

const panelGuard = crashGuard('pip-panel-guard', 'panel');
const frameGuard = crashGuard('pip-frame-guard', 'frame');
const armGuard = () => panelGuard.arm();
function guarded<T>(fn: () => T): T {
  panelGuard.arm();
  return fn();
}

function load(log: Log): ObjC | null {
  if (objc !== null) return objc || null;
  objc = false;
  if (process.platform !== 'darwin' || panelGuard.isOff(log)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const lib = koffi.load('/usr/lib/libobjc.A.dylib');
    const P = 'uintptr_t';
    // objc_msgSend must be declared once per argument/return shape (it's not variadic on Apple Silicon).
    const f = (ret: string, args: string[]) => lib.func('objc_msgSend', ret, args) as Fn;
    const selCache = new Map<string, number>();
    const selFn = lib.func('sel_registerName', P, ['str']) as Fn;
    const clsFn = lib.func('objc_getClass', P, ['str']) as Fn;
    const nameFn = lib.func('object_getClassName', 'str', [P]) as Fn;
    const send = f(P, [P, P]);
    const sendArg = f(P, [P, P, P]);
    const sendLevel = f('intptr_t', [P, P]);
    const sendBool = f('bool', [P, P]);
    const sendBoolArg = f('bool', [P, P, P]);
    const setUInt = f('void', [P, P, P]);
    const setInt = f('void', [P, P, 'intptr_t']);
    const setBool = f('void', [P, P, 'bool']);
    const call = f('void', [P, P]);
    // NSRect is four doubles. On Intel Macs a method returning it uses objc_msgSend_stret.
    const NSRect = koffi.struct('KiteNSRect', { x: 'double', y: 'double', width: 'double', height: 'double' });
    const getRect = lib.func(process.arch === 'x64' ? 'objc_msgSend_stret' : 'objc_msgSend', NSRect, [P, P]) as Fn;
    const setRect = f('void', [P, P, NSRect, 'bool', 'bool']);
    const setDouble = f('void', [P, P, 'double']);
    const getObjClass = lib.func('object_getClass', P, [P]) as Fn;
    const getImp = lib.func('class_getMethodImplementation', 'void *', [P, P]) as Fn;
    const getMethod = lib.func('class_getInstanceMethod', P, [P, P]) as Fn;
    const replaceMethod = lib.func('class_replaceMethod', 'void *', [P, P, 'void *', 'str']) as Fn;
    const selOf = (n: string) => {
      let s = selCache.get(n);
      if (s === undefined) selCache.set(n, (s = Number(selFn(n))));
      return s;
    };
    const runtime: ClassRuntime = {
      koffi,
      sel: selOf,
      objectGetClass: (o) => Number(getObjClass(o)),
      className: (o) => String(nameFn(o) ?? ''),
      hasMethod: (c, s) => Number(getMethod(c, s) ?? 0) !== 0,
      getImp: (c, s) => getImp(c, s),
      replaceMethod: (c, s, imp, t) => void replaceMethod(c, s, imp, t),
      getUInt: (o, s) => Number(send(o, s)),
      getInt: (o, s) => Number(sendLevel(o, s)),
      setUInt: (o, s, v) => void setUInt(o, s, v),
      setBool: (o, s, v) => void setBool(o, s, v),
      respondsTo: (o, s) => !!sendBoolArg(o, selOf('respondsToSelector:'), s),
    };
    objc = {
      runtime,
      sel: selOf,
      cls: (n) => Number(clsFn(n)),
      className: (o) => String(nameFn(o) ?? ''),
      send: (o, s) => Number(send(o, s)),
      sendArg: (o, s, a) => Number(sendArg(o, s, a)),
      sendLevel: (o, s) => Number(sendLevel(o, s)),
      sendBool: (o, s) => !!sendBool(o, s),
      sendBoolArg: (o, s, a) => !!sendBoolArg(o, s, a),
      setUInt: (o, s, v) => void setUInt(o, s, v),
      setInt: (o, s, v) => void setInt(o, s, v),
      setBool: (o, s, v) => void setBool(o, s, v),
      call: (o, s) => void call(o, s),
      frame: (w) => {
        const r = getRect(w, selOf('frame')) as Rect;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      setFrame: (w, r, animate) => void setRect(w, selOf('setFrame:display:animate:'), r, true, animate),
      setDouble: (o, s, v) => void setDouble(o, s, v),
    };
    return objc;
  } catch (err) {
    log(`panel: could not load the macOS bridge: ${(err as Error).message}`);
    return null;
  }
}

/** NSWindow addresses of Kite's own windows (never touched). */
function ownWindows(o: ObjC): Set<number> {
  const ours = new Set<number>();
  for (const bw of BrowserWindow.getAllWindows()) {
    try {
      const view = Number(bw.getNativeWindowHandle().readBigUInt64LE(0)); // an NSView
      if (view) ours.add(o.send(view, o.sel('window')));
    } catch {
      /* closing */
    }
  }
  return ours;
}

function listWindows(o: ObjC): NativeWindowInfo[] {
  const app = o.send(o.cls('NSApplication'), o.sel('sharedApplication'));
  const arr = o.send(app, o.sel('windows'));
  const n = o.send(arr, o.sel('count'));
  const out: NativeWindowInfo[] = [];
  for (let i = 0; i < n && i < 200; i++) {
    const w = o.sendArg(arr, o.sel('objectAtIndex:'), i);
    if (!w) continue;
    out.push({
      addr: w,
      className: o.className(w),
      level: o.sendLevel(w, o.sel('level')),
      visible: o.sendBool(w, o.sel('isVisible')),
      styleMask: o.send(w, o.sel('styleMask')),
      behavior: o.send(w, o.sel('collectionBehavior')),
    });
  }
  return out;
}

const reported = new Set<number>();

/**
 * macOS: install the hooks that make Chromium's floating video window a panel as
 * it's being set up. Call once at startup, before any video pops out.
 */
export function installVideoPanelHooks(log: Log) {
  const o = load(log);
  if (!o) return;
  try {
    const report = guarded(() =>
      installPanelHooks(o.runtime, o.cls('NSWindow'), {
        styleBits: NS.NonactivatingPanel,
        behaviorBits: NS.CanJoinAllSpaces | NS.FullScreenAuxiliary,
        behaviorClear: NS.MoveToActiveSpace,
        isVideoWindow: isVideoWindowSetup,
        log: (m) => log(`panel: ${m}`),
        onMark: armGuard,
      }),
    );
    log(`panel: ${report}`);
  } catch (err) {
    log(`panel: could not install hooks: ${(err as Error).message}`);
  }
}

/**
 * Find the floating video window and turn it into an always-on-top panel that
 * shows on every desktop and over full-screen apps. Returns how many video windows there are.
 */
export function floatPipWindows(log: Log, why: string, reportMissing = true): number {
  const o = load(log);
  if (!o) return 0;
  try {
    const ours = ownWindows(o);
    const all = listWindows(o);
    const pip = all.filter((w) => isPipWindow(w, ours));
    if (!pip.length) {
      if (!reportMissing) return 0;
      const others = all.filter((w) => !ours.has(w.addr) && w.visible);
      log(`panel (${why}): no floating video window found [other visible windows: ${others.map((w) => `${w.className}@${w.level}`).join(', ') || 'none'}]`);
      return 0;
    }
    for (const w of pip) {
      if (reported.has(w.addr)) continue;
      reported.add(w.addr);
      const early = isPanel(w.addr);
      if (!early) {
        // Slipped past the setup hooks (e.g. it existed before they were installed): mark it now.
        log(`panel (${why}): ${markPanel(o.runtime, w.addr, 'found on screen')}`);
        o.call(w.addr, o.sel('orderFrontRegardless'));
      }
      const selNonAct = o.sel('_isNonactivatingPanel');
      const nonAct = o.sendBoolArg(w.addr, o.sel('respondsToSelector:'), selNonAct) ? o.sendBool(w.addr, selNonAct) : null;
      const now = listWindows(o).find((x) => x.addr === w.addr);
      log(
        `panel (${why}): video window ${w.className} — ${early ? 'made a panel before it was shown' : 'made a panel late (fallback)'}; isNonactivatingPanel ${nonAct}; mask ${now?.styleMask}; behaviour ${now?.behavior}; level ${now?.level}`,
      );
    }
    return pip.length;
  } catch (err) {
    log(`panel (${why}): failed: ${(err as Error).message}`);
    return 0;
  }
}

/** The video window appears a moment after the pop-out starts, so look a few times. */
export function floatPipWindowsSoon(log: Log, why: string) {
  if (process.platform !== 'darwin') return;
  let found = false;
  const times = [0, 120, 350, 800, 1600];
  for (const ms of times) {
    setTimeout(() => {
      if (found) return;
      if (floatPipWindows(log, `${why} +${ms}ms`, ms === times[times.length - 1]) > 0) found = true;
    }, ms);
  }
}

// ---- Kite's frame around the floating video --------------------------------------


/** The floating video window on screen now (macOS), with its frame. */
export function findPipWindow(log: Log): { addr: number; frame: Rect } | null {
  const o = load(log);
  if (!o) return null;
  try {
    const ours = ownWindows(o);
    const w = listWindows(o).find((x) => isPipWindow(x, ours));
    return w ? { addr: w.addr, frame: o.frame(w.addr) } : null;
  } catch (err) {
    log(`frame: could not read the video window: ${(err as Error).message}`);
    return null;
  }
}

export function setPipWindowFrame(log: Log, addr: number, cocoaFrame: Rect, animate: boolean) {
  const o = load(log);
  if (!o) return;
  try {
    frameGuard.arm();
    o.setFrame(addr, cocoaFrame, animate);
  } catch (err) {
    log(`frame: could not resize the video window: ${(err as Error).message}`);
  }
}

/**
 * Kite's frame steps (show over the video, pin to it) run through here: if one
 * ever crashes Kite, the next launch of this build shows no frame instead.
 * The video window's own drawing is never touched — making it see-through to round
 * its corners crashed macOS once it counted as a panel.
 */
export function frameStep<T>(log: Log, step: string, fn: () => T, fallback: T): T {
  if (process.platform !== 'darwin' || frameGuard.isOff(log)) return fallback;
  log(`frame: ${step}…`);
  panelGuard.clear(); // the panel step is done by now; don't blame it for what follows
  frameGuard.arm();
  try {
    return fn();
  } catch (err) {
    log(`frame: ${step} failed: ${(err as Error).message}`);
    return fallback;
  }
}

/**
 * Round the video window's corners — only when it is already see-through. Making it
 * see-through ourselves crashed macOS once it counts as a panel, so an opaque window
 * is left square (its corners would show the window's light background otherwise).
 */
export function roundPipWindowIfSafe(log: Log, addr: number, radius: number): boolean {
  const o = load(log);
  if (!o) return false;
  try {
    if (o.sendBool(addr, o.sel('isOpaque'))) {
      log('frame: video window is opaque — corners left square, no shade');
      return false;
    }
    const view = o.send(addr, o.sel('contentView'));
    const layer = view ? o.send(view, o.sel('layer')) : 0;
    if (!layer) {
      log('frame: video window has no layer — corners left square, no shade');
      return false;
    }
    o.setDouble(layer, o.sel('setCornerRadius:'), radius);
    o.setBool(layer, o.sel('setMasksToBounds:'), true);
    o.call(addr, o.sel('invalidateShadow'));
    log(`frame: video window corners rounded (${radius}px)`);
    return true;
  } catch (err) {
    log(`frame: could not round the video window: ${(err as Error).message}`);
    return false;
  }
}

/** Chromium's video window stops taking the mouse: Kite's controls on top handle it all. */
export function ignoreMouseOnPipWindow(log: Log, addr: number) {
  const o = load(log);
  if (!o) return;
  try {
    o.setBool(addr, o.sel('setIgnoresMouseEvents:'), true);
  } catch (err) {
    log(`frame: could not make the video window ignore the mouse: ${(err as Error).message}`);
  }
}


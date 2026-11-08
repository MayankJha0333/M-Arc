// macOS only: talks to AppKit directly (through koffi, which calls system libraries
// from JavaScript — nothing to compile) to make the floating video window a panel
// that stays on top of every app, including full-screen ones, like Arc does.
// Electron has no setting for Chromium's video window, so this is the only way in.

import { app, BrowserWindow } from 'electron';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPipWindow, NS, type NativeWindowInfo } from '../shared/pipWindow';
import { isPanel, makePanel, type ClassRuntime } from './objcPanel';

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
  /** For building the panel subclass. */
  runtime: ClassRuntime;
}

let objc: ObjC | null | false = null;

// ---- Crash safety net -----------------------------------------------------------
// This reaches into macOS directly; if it ever crashes Kite, the next launch turns
// the panel step off (for that build of Kite) instead of crashing again.

const guardFile = () => join(app.getPath('userData'), 'pip-panel-guard');
function buildId(): string {
  try {
    return String(statSync(join(__dirname, 'main.cjs')).mtimeMs);
  } catch {
    return app.getVersion();
  }
}
let disabled: boolean | null = null;
function panelsDisabled(log: Log): boolean {
  if (disabled !== null) return disabled;
  disabled = false;
  try {
    if (existsSync(guardFile())) {
      if (readFileSync(guardFile(), 'utf8') === buildId()) {
        disabled = true;
        log('panel: turned off — Kite closed unexpectedly while doing this last time');
      } else unlinkSync(guardFile()); // a newer build: try again
    }
  } catch {
    /* ignore */
  }
  return disabled;
}
const clearGuard = () => {
  try {
    unlinkSync(guardFile());
  } catch {
    /* already gone */
  }
};
let guardTimer: ReturnType<typeof setTimeout> | null = null;
function guarded<T>(fn: () => T): T {
  try {
    writeFileSync(guardFile(), buildId());
  } catch {
    /* ignore */
  }
  if (!guardTimer) app.once('will-quit', clearGuard); // a normal quit is not a crash
  const out = fn();
  // Survived the change and half a minute of macOS using it (switching apps etc.): clear the marker.
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = setTimeout(clearGuard, 30_000);
  return out;
}

function load(log: Log): ObjC | null {
  if (objc !== null) return objc || null;
  objc = false;
  if (process.platform !== 'darwin' || panelsDisabled(log)) return null;
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
    const getObjClass = lib.func('object_getClass', P, [P]) as Fn;
    const getImp = lib.func('class_getMethodImplementation', 'void *', [P, P]) as Fn;
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
      getImp: (c, s) => getImp(c, s),
      replaceMethod: (c, s, imp, t) => void replaceMethod(c, s, imp, t),
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
      if (isPanel(w.addr) && (w.styleMask & NS.NonactivatingPanel) !== 0) continue; // done already
      // 1. Make it a panel: it now always reports the panel flag and always keeps
      //    "every desktop + over full-screen apps" (Chromium can't undo it).
      const result = guarded(() =>
        makePanel(o.runtime, w.addr, {
          styleBits: NS.NonactivatingPanel,
          behaviorBits: NS.CanJoinAllSpaces | NS.FullScreenAuxiliary,
          behaviorClear: NS.MoveToActiveSpace,
        }),
      );
      log(`panel (${why}): ${result}`);
      // 2. Re-apply both so macOS re-reads them.
      o.setUInt(w.addr, o.sel('setStyleMask:'), o.send(w.addr, o.sel('styleMask')));
      o.setUInt(w.addr, o.sel('setCollectionBehavior:'), o.send(w.addr, o.sel('collectionBehavior')));
      o.setInt(w.addr, o.sel('setLevel:'), NS.FloatingLevel);
      o.setBool(w.addr, o.sel('setHidesOnDeactivate:'), false);
      log(`panel (${why}): flags re-applied`);
      // 3. The switch NSPanel itself flips for "don't activate the app", if this macOS has it.
      const prevent = o.sel('_setPreventsActivation:');
      const hasPrevent = o.sendBoolArg(w.addr, o.sel('respondsToSelector:'), prevent);
      if (hasPrevent) o.setBool(w.addr, prevent, true);
      o.call(w.addr, o.sel('orderFrontRegardless'));
      const after = listWindows(o).find((x) => x.addr === w.addr);
      log(
        `panel (${why}): ${w.className} → ${result}; mask ${w.styleMask}→${after?.styleMask} behaviour ${w.behavior}→${after?.behavior} level ${after?.level} preventsActivation ${hasPrevent ? 'set' : 'n/a'}`,
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

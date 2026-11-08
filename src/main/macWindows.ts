// macOS only: talks to AppKit directly (through koffi, which calls system libraries
// from JavaScript — nothing to compile) to make the floating video window a panel
// that stays on top of every app, including full-screen ones, like Arc does.
// Electron has no setting for Chromium's video window, so this is the only way in.

import { BrowserWindow } from 'electron';
import { floatingFlags, isPipWindow, needsFloating, NS, type NativeWindowInfo } from '../shared/pipWindow';

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
}

let objc: ObjC | null | false = null;

function load(log: Log): ObjC | null {
  if (objc !== null) return objc || null;
  objc = false;
  if (process.platform !== 'darwin') return null;
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
    objc = {
      sel: (n) => {
        let s = selCache.get(n);
        if (s === undefined) selCache.set(n, (s = Number(selFn(n))));
        return s;
      },
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
      if (!needsFloating(w)) continue;
      const f = floatingFlags(w.styleMask, w.behavior);
      o.setUInt(w.addr, o.sel('setStyleMask:'), f.styleMask);
      o.setUInt(w.addr, o.sel('setCollectionBehavior:'), f.behavior);
      o.setInt(w.addr, o.sel('setLevel:'), NS.PanelLevel);
      o.setBool(w.addr, o.sel('setHidesOnDeactivate:'), false);
      // Private AppKit switch that NSPanel uses for "don't activate the app"; skipped if it's missing.
      const prevent = o.sel('_setPreventsActivation:');
      if (o.sendBoolArg(w.addr, o.sel('respondsToSelector:'), prevent)) o.setBool(w.addr, prevent, true);
      o.call(w.addr, o.sel('orderFrontRegardless'));
      const after = listWindows(o).find((x) => x.addr === w.addr);
      log(
        `panel (${why}): ${w.className} level ${w.level}→${after?.level} mask ${w.styleMask}→${after?.styleMask} behaviour ${w.behavior}→${after?.behavior}`,
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

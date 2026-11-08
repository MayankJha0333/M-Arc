// The "make the video window a panel" hooks, run against GCC's Objective-C runtime
// on Linux (macOS's runtime has the same class functions). A fake window class tree
// shaped like macOS's: a base window class, Chromium's frameless window, macOS's
// hidden change-watching subclass, and Kite's own window class.
// Skipped where libobjc isn't installed.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { installPanelHooks, isPanel, markPanel, type ClassRuntime } from '../../src/main/objcPanel';
import { isVideoWindowSetup, NS } from '@shared/pipWindow';

const LIB = ['/usr/lib/x86_64-linux-gnu/libobjc.so.4', '/usr/lib/aarch64-linux-gnu/libobjc.so.4'].find((p) => existsSync(p));

describe.skipIf(!LIB)('floating video window hooks (Objective-C runtime)', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const koffi = createRequire(import.meta.url)('koffi');
  const lib = koffi.load(LIB!);
  const P = 'uintptr_t';
  const fn = (n: string, r: string, a: string[]) => lib.func(n, r, a) as (...x: any[]) => any;
  const getClass = fn('objc_getClass', P, ['str']);
  const lookUpClass = fn('objc_lookUpClass', P, ['str']);
  const selFn = fn('sel_registerName', P, ['str']);
  const sel = (n: string) => Number(selFn(n));
  const allocPair = fn('objc_allocateClassPair', P, [P, 'str', 'size_t']);
  const regPair = fn('objc_registerClassPair', 'void', [P]);
  const addMethod = fn('class_addMethod', 'bool', [P, P, 'void *', 'str']);
  const getImp = fn('class_getMethodImplementation', 'void *', [P, P]);
  const getMethod = fn('class_getInstanceMethod', P, [P, P]);
  const replaceMethod = fn('class_replaceMethod', 'void *', [P, P, 'void *', 'str']);
  const className = fn('object_getClassName', 'str', [P]);
  const createInstance = fn('class_createInstance', P, [P, 'size_t']);
  const msgLookup = fn('objc_msg_lookup', 'void *', [P, P]);
  const T = {
    GetU: koffi.proto('uintptr_t TGetU(uintptr_t s, uintptr_t c)'),
    GetI: koffi.proto('intptr_t TGetI(uintptr_t s, uintptr_t c)'),
    GetB: koffi.proto('bool TGetB(uintptr_t s, uintptr_t c)'),
    SetU: koffi.proto('void TSetU(uintptr_t s, uintptr_t c, uintptr_t v)'),
    SetI: koffi.proto('void TSetI(uintptr_t s, uintptr_t c, intptr_t v)'),
    SetB: koffi.proto('void TSetB(uintptr_t s, uintptr_t c, bool v)'),
  };
  const call = (o: number, s: string, t: any, ...a: unknown[]) => koffi.call(msgLookup(o, sel(s)), t, o, sel(s), ...a);

  // The base window class (stands in for NSWindow), with per-window state.
  const state = new Map<number, { level: number; behavior: number; prevents: boolean; hides: boolean }>();
  const st = (o: number) => {
    if (!state.has(o)) state.set(o, { level: 0, behavior: 0, prevents: false, hides: true });
    return state.get(o)!;
  };
  const keep: unknown[] = [];
  const add = (cls: number, name: string, f: (...a: any[]) => unknown, t: any, enc: string) => {
    const imp = koffi.register(f, koffi.pointer(t));
    keep.push(imp);
    addMethod(cls, sel(name), imp, enc);
  };
  const NSWin = Number(allocPair(getClass('Object'), 'FakeNSWindow', 0));
  add(NSWin, 'level', (s: number) => st(Number(s)).level, T.GetI, 'q@:');
  add(NSWin, 'setLevel:', (s: number, _c: number, v: number) => void (st(Number(s)).level = Number(v)), T.SetI, 'v@:q');
  add(NSWin, 'collectionBehavior', (s: number) => st(Number(s)).behavior, T.GetU, 'Q@:');
  add(NSWin, 'setCollectionBehavior:', (s: number, _c: number, v: number) => void (st(Number(s)).behavior = Number(v)), T.SetU, 'v@:Q');
  add(NSWin, 'styleMask', () => 32776, T.GetU, 'Q@:');
  add(NSWin, '_isNonactivatingPanel', () => false, T.GetB, 'c@:');
  add(NSWin, '_setPreventsActivation:', (s: number, _c: number, v: boolean) => void (st(Number(s)).prevents = !!v), T.SetB, 'v@:c');
  add(NSWin, 'setHidesOnDeactivate:', (s: number, _c: number, v: boolean) => void (st(Number(s)).hides = !!v), T.SetB, 'v@:c');
  regPair(NSWin);
  const sub = (name: string, sup: number) => {
    const c = Number(allocPair(sup, name, 0));
    regPair(c);
    return c;
  };
  const Frameless = sub('NativeWidgetMacFramelessNSWindow', NSWin);
  const Watched = sub('NSKVONotifying_NativeWidgetMacFramelessNSWindow', Frameless);
  const Electron = sub('ElectronNSWindow', NSWin);

  const rt: ClassRuntime = {
    koffi,
    sel,
    // GCC doesn't export object_getClass; look the class up by name instead.
    objectGetClass: (o) => Number(lookUpClass(className(o))),
    className: (o) => String(className(o)),
    hasMethod: (c, s) => Number(getMethod(c, s) ?? 0) !== 0,
    getImp: (c, s) => getImp(c, s),
    replaceMethod: (c, s, imp, t) => void replaceMethod(c, s, imp, t),
    getUInt: (o, s) => Number(koffi.call(msgLookup(o, s), T.GetU, o, s)),
    getInt: (o, s) => Number(koffi.call(msgLookup(o, s), T.GetI, o, s)),
    setUInt: (o, s, v) => koffi.call(msgLookup(o, s), T.SetU, o, s, v),
    setBool: (o, s, v) => koffi.call(msgLookup(o, s), T.SetB, o, s, v),
    respondsTo: (o, s) => Number(getMethod(Number(lookUpClass(className(o))), s) ?? 0) !== 0,
  };
  const logs: string[] = [];
  const report = installPanelHooks(rt, NSWin, {
    styleBits: NS.NonactivatingPanel,
    behaviorBits: NS.CanJoinAllSpaces | NS.FullScreenAuxiliary,
    behaviorClear: NS.MoveToActiveSpace,
    isVideoWindow: isVideoWindowSetup,
    log: (m) => logs.push(m),
  });
  const nonAct = (o: number) => !!call(o, '_isNonactivatingPanel', T.GetB);
  const mask = (o: number) => Number(call(o, 'styleMask', T.GetU));
  const behavior = (o: number) => Number(call(o, 'collectionBehavior', T.GetU));
  /** What Chromium does when it builds its floating video window, before showing it. */
  const chromiumSetsUp = (o: number, order: 'behavior-first' | 'level-first') => {
    if (order === 'behavior-first') {
      call(o, 'setCollectionBehavior:', T.SetU, 1 | 4 | 32);
      call(o, 'setLevel:', T.SetI, NS.FloatingLevel);
    } else {
      call(o, 'setLevel:', T.SetI, NS.FloatingLevel);
      call(o, 'setCollectionBehavior:', T.SetU, 1 | 4 | 32);
    }
  };

  it('installs the hooks', () => {
    expect(report).toBe('_isNonactivatingPanel hooked, setup hooks installed');
  });

  it('the video window is a panel before it is shown — whichever order Chromium sets it up in', () => {
    for (const order of ['behavior-first', 'level-first'] as const) {
      const w = Number(createInstance(Watched, 0));
      expect(nonAct(w)).toBe(false);
      chromiumSetsUp(w, order);
      expect(isPanel(w)).toBe(true);
      expect(nonAct(w)).toBe(true); // what macOS checks
      expect(mask(w) & NS.NonactivatingPanel).toBeTruthy();
      expect(behavior(w)).toBe(1 | 4 | 32 | NS.FullScreenAuxiliary); // over full-screen apps
      expect(st(w).prevents).toBe(true); // clicking it doesn't bring Kite forward
      expect(st(w).hides).toBe(false);
      expect(String(className(w))).toBe('NSKVONotifying_NativeWidgetMacFramelessNSWindow'); // class never swapped
    }
  });

  it('keeps "over full-screen apps" even if Chromium resets the behaviour later', () => {
    const w = Number(createInstance(Frameless, 0));
    chromiumSetsUp(w, 'level-first');
    call(w, 'setCollectionBehavior:', T.SetU, 1 | 2 | 4);
    expect(behavior(w)).toBe(1 | 4 | NS.FullScreenAuxiliary);
  });

  it('leaves Kite’s own windows and other windows exactly as they were', () => {
    const kite = Number(createInstance(Electron, 0));
    call(kite, 'setCollectionBehavior:', T.SetU, 1 | 4);
    call(kite, 'setLevel:', T.SetI, NS.FloatingLevel); // e.g. "always on top"
    expect(isPanel(kite)).toBe(false);
    expect(nonAct(kite)).toBe(false);
    expect(behavior(kite)).toBe(1 | 4);
    expect(st(kite).prevents).toBe(false);

    const menu = Number(createInstance(Frameless, 0));
    call(menu, 'setLevel:', T.SetI, 101); // a Chromium menu, not the video
    call(menu, 'setCollectionBehavior:', T.SetU, 2);
    expect(isPanel(menu)).toBe(false);
    expect(nonAct(menu)).toBe(false);
    expect(mask(menu)).toBe(32776);
  });

  it('a video window already on screen can still be marked (fallback)', () => {
    const w = Number(createInstance(Frameless, 0));
    call(w, 'setLevel:', T.SetI, NS.FloatingLevel);
    expect(isPanel(w)).toBe(false); // not on every desktop yet, so not recognised
    markPanel(rt, w, 'found on screen');
    expect(nonAct(w)).toBe(true);
    expect(behavior(w) & NS.FullScreenAuxiliary).toBeTruthy();
    expect(logs.some((l) => l.includes('found on screen'))).toBe(true);
  });
});

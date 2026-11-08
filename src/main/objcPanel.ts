// Makes Chromium's floating video window behave like a macOS "panel", so it can
// float over other apps — including their full-screen Spaces — like Arc's.
//
// What macOS actually checks (found by Ardia, another Chromium browser that fixed
// this; Arc hosts its video in a real NSPanel with the same settings):
//   1. -_isNonactivatingPanel must answer YES. Setting the style flag on a normal
//      window is silently ignored, so this answer is overridden instead.
//   2. It is checked when the window is FIRST SHOWN. Changing a window that is
//      already on screen is too late, so the video window is recognised while
//      Chromium is setting it up (its level and collection behaviour are set
//      before it appears) and marked right then.
//   3. The window keeps its class: swapping it breaks macOS's change-watching (KVO)
//      and crashes. Overrides only change the answer for windows we marked; every
//      other window gets the original answer.
//
// Runtime-agnostic so it can be tested on Linux with GCC's Objective-C runtime.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassRuntime {
  koffi: any;
  sel(name: string): number;
  objectGetClass(obj: number): number;
  className(obj: number): string;
  /** Does this class (or a superclass) implement the method? */
  hasMethod(cls: number, sel: number): boolean;
  /** The implementation (a C function pointer) a message to this class runs now, inherited or not. */
  getImp(cls: number, sel: number): unknown;
  /** Set this class's own implementation of a method (adding it if it only inherits one). */
  replaceMethod(cls: number, sel: number, imp: unknown, types: string): void;
  getUInt(obj: number, sel: number): number;
  getInt(obj: number, sel: number): number;
  setUInt(obj: number, sel: number, v: number): void;
  setBool(obj: number, sel: number, v: boolean): void;
  respondsTo(obj: number, sel: number): boolean;
}

export interface WindowInfo {
  className: string;
  level: number;
  behavior: number;
}

export interface PanelOptions {
  /** Always reported as part of the style mask. */
  styleBits: number;
  /** Always added to the collection behaviour… */
  behaviorBits: number;
  /** …and these always removed (they conflict). */
  behaviorClear: number;
  /** Is this the floating video window being set up? */
  isVideoWindow(w: WindowInfo): boolean;
  log(msg: string): void;
  /** Called just before a window is changed (for Kite's crash safety net). */
  onMark?(): void;
}

// AppKit's flags all fit in 32 bits.
const withBits = (v: number, add: number, clear = 0) => ((v | add) & ~clear) >>> 0;

/** Windows (by address) that act as panels. */
const panels = new Set<number>();
/** Classes whose styleMask is already overridden. */
const styled = new Set<number>();
// Registered callbacks must live as long as the classes using them.
const keep: unknown[] = [];
let hooked = false;
let opts: PanelOptions | null = null;
let protos: { GetUInt: any; GetBool: any; SetUInt: any; SetInt: any } | null = null;

function types(koffi: any) {
  if (!protos) {
    protos = {
      GetUInt: koffi.proto('uintptr_t KitePanelGetUInt(uintptr_t self, uintptr_t cmd)'),
      GetBool: koffi.proto('bool KitePanelGetBool(uintptr_t self, uintptr_t cmd)'),
      SetUInt: koffi.proto('void KitePanelSetUInt(uintptr_t self, uintptr_t cmd, uintptr_t value)'),
      SetInt: koffi.proto('void KitePanelSetInt(uintptr_t self, uintptr_t cmd, intptr_t value)'),
    };
  }
  return protos;
}

/** Report the panel style flag for marked windows of this window's class. */
function overrideStyleMask(rt: ClassRuntime, obj: number) {
  const cls = rt.objectGetClass(obj);
  if (styled.has(cls) || !opts) return;
  const { koffi } = rt;
  const { GetUInt } = types(koffi);
  const sel = rt.sel('styleMask');
  const prev = rt.getImp(cls, sel);
  const bits = opts.styleBits;
  const imp = koffi.register((self: number, cmd: number) => {
    const m = Number(koffi.call(prev, GetUInt, self, cmd));
    return panels.has(Number(self)) ? withBits(m, bits) : m;
  }, koffi.pointer(GetUInt));
  keep.push(imp);
  rt.replaceMethod(cls, sel, imp, 'Q@:');
  styled.add(cls);
}

/**
 * Mark a window as a panel. `reapply` pushes its collection behaviour through
 * the hook again (not needed when called from inside that hook).
 */
function mark(rt: ClassRuntime, obj: number, reapply: boolean, why: string): string {
  if (panels.has(obj)) return 'already a panel';
  opts?.onMark?.();
  panels.add(obj);
  overrideStyleMask(rt, obj);
  rt.setBool(obj, rt.sel('setHidesOnDeactivate:'), false);
  // What NSPanel does for "clicking me doesn't bring the app forward".
  const prevent = rt.sel('_setPreventsActivation:');
  const canPrevent = rt.respondsTo(obj, prevent);
  if (canPrevent) rt.setBool(obj, prevent, true);
  if (reapply) rt.setUInt(obj, rt.sel('setCollectionBehavior:'), rt.getUInt(obj, rt.sel('collectionBehavior')));
  const msg = `${rt.className(obj)} marked as a panel (${why}; preventsActivation ${canPrevent ? 'set' : 'n/a'})`;
  opts?.log(msg);
  return msg;
}

/**
 * Install the overrides on the window base class (NSWindow), once.
 * Returns a short report for the debug log.
 */
export function installPanelHooks(rt: ClassRuntime, windowClass: number, options: PanelOptions): string {
  if (hooked) return 'already installed';
  opts = options;
  const { koffi } = rt;
  const { GetBool, SetUInt, SetInt } = types(koffi);
  const report: string[] = [];

  // 1. The answer macOS checks.
  const selNonAct = rt.sel('_isNonactivatingPanel');
  if (rt.hasMethod(windowClass, selNonAct)) {
    const prev = rt.getImp(windowClass, selNonAct);
    const imp = koffi.register((self: number, cmd: number) => (panels.has(Number(self)) ? true : !!koffi.call(prev, GetBool, self, cmd)), koffi.pointer(GetBool));
    keep.push(imp);
    rt.replaceMethod(windowClass, selNonAct, imp, 'c@:');
    report.push('_isNonactivatingPanel hooked');
  } else report.push('_isNonactivatingPanel missing (style flag only)');

  // 2. Catch the video window while it's being set up, before it's shown.
  const selBehavior = rt.sel('setCollectionBehavior:');
  const selLevel = rt.sel('setLevel:');
  const selGetBehavior = rt.sel('collectionBehavior');
  const selGetLevel = rt.sel('level');
  const prevBehavior = rt.getImp(windowClass, selBehavior);
  const prevLevel = rt.getImp(windowClass, selLevel);

  const behaviorImp = koffi.register((self: number, cmd: number, value: number) => {
    const obj = Number(self);
    let v = Number(value);
    try {
      if (!panels.has(obj) && options.isVideoWindow({ className: rt.className(obj), level: rt.getInt(obj, selGetLevel), behavior: v })) {
        mark(rt, obj, false, 'collection behaviour set');
      }
      if (panels.has(obj)) v = withBits(v, options.behaviorBits, options.behaviorClear);
    } catch (err) {
      options.log(`panel hook error: ${(err as Error).message}`);
    }
    koffi.call(prevBehavior, SetUInt, self, cmd, v);
  }, koffi.pointer(SetUInt));

  const levelImp = koffi.register((self: number, cmd: number, value: number) => {
    koffi.call(prevLevel, SetInt, self, cmd, value);
    const obj = Number(self);
    try {
      if (!panels.has(obj) && options.isVideoWindow({ className: rt.className(obj), level: Number(value), behavior: rt.getUInt(obj, selGetBehavior) })) {
        mark(rt, obj, true, 'level set');
      }
    } catch (err) {
      options.log(`panel hook error: ${(err as Error).message}`);
    }
  }, koffi.pointer(SetInt));

  keep.push(behaviorImp, levelImp);
  rt.replaceMethod(windowClass, selBehavior, behaviorImp, 'v@:Q');
  rt.replaceMethod(windowClass, selLevel, levelImp, 'v@:q');
  report.push('setup hooks installed');
  hooked = true;
  return report.join(', ');
}

/** Fallback for a video window that slipped past the hooks (already on screen). */
export function markPanel(rt: ClassRuntime, obj: number, why: string): string {
  if (!opts) return 'hooks not installed';
  return mark(rt, obj, true, why);
}

export const isPanel = (obj: number) => panels.has(obj);

/** Stop treating a window as a panel (it closed; its address may be reused). */
export function forgetPanel(obj: number) {
  panels.delete(obj);
}

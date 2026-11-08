// Makes an existing macOS window behave like a "panel" after it was created, the
// way Electron's own panel windows work: the window always reports the panel style
// flag and always keeps "show on every desktop and over full-screen apps". macOS
// reads those answers to decide where the window may appear.
//
// The window's class is NOT changed: macOS's change-watching (KVO) gives watched
// windows a hidden class that keeps its own data, and swapping it crashes. Instead
// the two methods are overridden on the class the window already has, and the
// override only changes the answer for windows we marked — every other window of
// that class gets the original answer.
//
// Runtime-agnostic so it can be tested on Linux with GCC's Objective-C runtime.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassRuntime {
  koffi: any;
  sel(name: string): number;
  objectGetClass(obj: number): number;
  className(obj: number): string;
  /** The implementation (a C function pointer) a message to this class runs now, inherited or not. */
  getImp(cls: number, sel: number): unknown;
  /** Set this class's own implementation of a method (adding it if it only inherits one). */
  replaceMethod(cls: number, sel: number, imp: unknown, types: string): void;
}

export interface PanelFlags {
  /** Always reported as part of the style mask. */
  styleBits: number;
  /** Always added to the collection behaviour… */
  behaviorBits: number;
  /** …and these always removed (they conflict). */
  behaviorClear: number;
}

// AppKit's flags all fit in 32 bits.
const withBits = (v: number, add: number, clear = 0) => ((v | add) & ~clear) >>> 0;

/** Windows (by address) that should act as panels. */
const panels = new Set<number>();
/** Classes whose methods are already overridden. */
const patched = new Set<number>();
// Registered callbacks must live as long as the classes using them.
const keep: unknown[] = [];

function patchClass(rt: ClassRuntime, cls: number, flags: PanelFlags) {
  const { koffi } = rt;
  const id = patched.size;
  const GetUInt = koffi.proto(`uintptr_t KitePanelGet${id}(uintptr_t self, uintptr_t cmd)`);
  const SetUInt = koffi.proto(`void KitePanelSet${id}(uintptr_t self, uintptr_t cmd, uintptr_t value)`);
  const selMask = rt.sel('styleMask');
  const selBehavior = rt.sel('setCollectionBehavior:');
  // What these methods did before (the class's own, or inherited) — called for the real answer.
  const prevMask = rt.getImp(cls, selMask);
  const prevSetBehavior = rt.getImp(cls, selBehavior);
  const maskImp = koffi.register((self: number, cmd: number) => {
    const m = Number(koffi.call(prevMask, GetUInt, self, cmd));
    return panels.has(Number(self)) ? withBits(m, flags.styleBits) : m;
  }, koffi.pointer(GetUInt));
  const behaviorImp = koffi.register((self: number, cmd: number, value: number) => {
    const v = panels.has(Number(self)) ? withBits(Number(value), flags.behaviorBits, flags.behaviorClear) : Number(value);
    koffi.call(prevSetBehavior, SetUInt, self, cmd, v);
  }, koffi.pointer(SetUInt));
  keep.push(maskImp, behaviorImp);
  rt.replaceMethod(cls, selMask, maskImp, 'Q@:');
  rt.replaceMethod(cls, selBehavior, behaviorImp, 'v@:Q');
  patched.add(cls);
}

/** Make `obj` act like a panel. Returns what happened, for the debug log. */
export function makePanel(rt: ClassRuntime, obj: number, flags: PanelFlags): string {
  // Checked every time: macOS may give the window a different hidden class later.
  const cls = rt.objectGetClass(obj);
  const fresh = !patched.has(cls);
  if (fresh) patchClass(rt, cls, flags);
  if (panels.has(obj) && !fresh) return 'already a panel';
  panels.add(obj);
  return `panel (${fresh ? 'patched' : 'reused'} ${rt.className(obj)})`;
}

/** Stop treating a window as a panel (it closed; its address may be reused). */
export function forgetPanel(obj: number) {
  panels.delete(obj);
}

export const isPanel = (obj: number) => panels.has(obj);

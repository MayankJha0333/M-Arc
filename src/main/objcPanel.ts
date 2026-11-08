// Turns an existing macOS window into a "panel" after it was created, the way
// Electron's own panel windows work: the window is moved to a tiny subclass of its
// own class that always reports the panel style flag and always adds "show on every
// desktop and over full-screen apps" to its collection behaviour. macOS reads those
// answers to decide where the window may appear.
//
// Runtime-agnostic so it can be tested on Linux with GCC's Objective-C runtime.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassRuntime {
  koffi: any;
  sel(name: string): number;
  objectGetClass(obj: number): number;
  className(obj: number): string;
  lookUpClass(name: string): number;
  allocateClassPair(superclass: number, name: string): number;
  registerClassPair(cls: number): void;
  /** The current implementation (a C function pointer) of a method. */
  getImp(cls: number, sel: number): unknown;
  addMethod(cls: number, sel: number, imp: unknown, types: string): boolean;
  setClass(obj: number, cls: number): void;
}

export interface PanelFlags {
  /** Always reported as part of the style mask. */
  styleBits: number;
  /** Always added to the collection behaviour… */
  behaviorBits: number;
  /** …and these always removed (they conflict). */
  behaviorClear: number;
}

export const PANEL_PREFIX = 'KitePanel_';

// Registered callbacks must live as long as the classes using them.
const keep: unknown[] = [];
const made = new Map<number, number>();

// AppKit's flags all fit in 32 bits.
const withBits = (v: number, add: number, clear = 0) => ((v | add) & ~clear) >>> 0;

/** Make `obj` behave like a panel. Returns what happened, for the debug log. */
export function makePanel(rt: ClassRuntime, obj: number, flags: PanelFlags): string {
  const current = rt.objectGetClass(obj);
  const currentName = rt.className(obj);
  if (currentName.startsWith(PANEL_PREFIX)) return 'already a panel';
  let sub = made.get(current);
  if (!sub) {
    const name = PANEL_PREFIX + currentName.replace(/[^A-Za-z0-9_]/g, '_');
    sub = rt.lookUpClass(name);
    if (!sub) {
      sub = rt.allocateClassPair(current, name);
      if (!sub) return `could not create ${name}`;
      const { koffi } = rt;
      const GetUInt = koffi.proto(`uintptr_t ${name}_GetUInt(uintptr_t self, uintptr_t cmd)`);
      const SetUInt = koffi.proto(`void ${name}_SetUInt(uintptr_t self, uintptr_t cmd, uintptr_t value)`);
      const selMask = rt.sel('styleMask');
      const selBehavior = rt.sel('setCollectionBehavior:');
      const superMask = rt.getImp(current, selMask);
      const superSetBehavior = rt.getImp(current, selBehavior);
      // styleMask → what the window really has, plus the panel flag.
      const maskImp = koffi.register(
        (self: number, cmd: number) => withBits(Number(koffi.call(superMask, GetUInt, self, cmd)), flags.styleBits),
        koffi.pointer(GetUInt),
      );
      // setCollectionBehavior: → whatever is asked, but always on every desktop and over full-screen apps.
      const behaviorImp = koffi.register(
        (self: number, cmd: number, value: number) => koffi.call(superSetBehavior, SetUInt, self, cmd, withBits(Number(value), flags.behaviorBits, flags.behaviorClear)),
        koffi.pointer(SetUInt),
      );
      keep.push(maskImp, behaviorImp);
      const ok1 = rt.addMethod(sub, selMask, maskImp, 'Q@:');
      const ok2 = rt.addMethod(sub, selBehavior, behaviorImp, 'v@:Q');
      rt.registerClassPair(sub);
      if (!ok1 || !ok2) return `could not add methods to ${name}`;
    }
    made.set(current, sub);
  }
  rt.setClass(obj, sub);
  return `now ${rt.className(obj)}`;
}

export { withBits as _withBits };

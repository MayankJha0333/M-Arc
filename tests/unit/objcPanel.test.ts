// The "make it a panel" trick, run against GCC's Objective-C runtime on Linux
// (macOS's runtime has the same functions). Skipped where libobjc isn't installed.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { isPanel, makePanel, type ClassRuntime } from '../../src/main/objcPanel';

const LIB = ['/usr/lib/x86_64-linux-gnu/libobjc.so.4', '/usr/lib/aarch64-linux-gnu/libobjc.so.4'].find((p) => existsSync(p));
const NAP = 1 << 7;
const flags = { styleBits: NAP, behaviorBits: 1 | 256, behaviorClear: 2 };

describe.skipIf(!LIB)('turning a live window object into a panel (Objective-C runtime)', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const koffi = createRequire(import.meta.url)('koffi');
  const lib = koffi.load(LIB!);
  const P = 'uintptr_t';
  const fn = (n: string, r: string, a: string[]) => lib.func(n, r, a) as (...x: any[]) => any;
  const getClass = fn('objc_getClass', P, ['str']);
  const lookUpClass = fn('objc_lookUpClass', P, ['str']);
  const sel = (n: string) => Number(fn('sel_registerName', P, ['str'])(n));
  const allocPair = fn('objc_allocateClassPair', P, [P, 'str', 'size_t']);
  const regPair = fn('objc_registerClassPair', 'void', [P]);
  const addMethod = fn('class_addMethod', 'bool', [P, P, 'void *', 'str']);
  const getImp = fn('class_getMethodImplementation', 'void *', [P, P]);
  const replaceMethod = fn('class_replaceMethod', 'void *', [P, P, 'void *', 'str']);
  const className = fn('object_getClassName', 'str', [P]);
  const createInstance = fn('class_createInstance', P, [P, 'size_t']);
  const msgLookup = fn('objc_msg_lookup', 'void *', [P, P]);
  const GetUInt = koffi.proto('uintptr_t TGetU(uintptr_t self, uintptr_t cmd)');
  const SetUInt = koffi.proto('void TSetU(uintptr_t self, uintptr_t cmd, uintptr_t v)');
  const get = (o: number, s: string) => Number(koffi.call(msgLookup(o, sel(s)), GetUInt, o, sel(s)));
  const set = (o: number, s: string, v: number) => koffi.call(msgLookup(o, sel(s)), SetUInt, o, sel(s), v);

  // A stand-in for Chromium's video window: a real class with its own styleMask and behaviour.
  const Win = Number(allocPair(getClass('Object'), 'FakeVideoWindow', 0));
  const store = new Map<number, number>();
  const keep = [
    koffi.register(() => 32776, koffi.pointer(GetUInt)),
    koffi.register((self: number, _c: number, v: number) => void store.set(Number(self), Number(v)), koffi.pointer(SetUInt)),
    koffi.register((self: number) => store.get(Number(self)) ?? 37, koffi.pointer(GetUInt)),
  ];
  addMethod(Win, sel('styleMask'), keep[0], 'Q@:');
  addMethod(Win, sel('setCollectionBehavior:'), keep[1], 'v@:Q');
  addMethod(Win, sel('collectionBehavior'), keep[2], 'Q@:');
  regPair(Win);
  // Like macOS's hidden change-watching class: a subclass that only inherits these methods.
  const Watched = Number(allocPair(Win, 'NSKVONotifying_FakeVideoWindow', 0));
  regPair(Watched);

  const rt: ClassRuntime = {
    koffi,
    sel,
    // GCC doesn't export object_getClass; look the class up by name instead.
    objectGetClass: (o) => Number(lookUpClass(className(o))),
    className: (o) => String(className(o)),
    getImp: (c, s) => getImp(c, s),
    replaceMethod: (c, s, imp, t) => void replaceMethod(c, s, imp, t),
  };

  it('the window reports the panel flag (keeping its own flags) and keeps its class', () => {
    const w = Number(createInstance(Win, 0));
    expect(get(w, 'styleMask')).toBe(32776);
    expect(makePanel(rt, w, flags)).toBe('panel (patched FakeVideoWindow)');
    expect(get(w, 'styleMask')).toBe(32776 | NAP);
    expect(String(className(w))).toBe('FakeVideoWindow'); // the class is never swapped (that crashed macOS)
  });

  it('other windows of the same kind are left exactly as they were', () => {
    const other = Number(createInstance(Win, 0));
    expect(isPanel(other)).toBe(false);
    expect(get(other, 'styleMask')).toBe(32776);
    set(other, 'setCollectionBehavior:', 2 | 4);
    expect(get(other, 'collectionBehavior')).toBe(2 | 4);
  });

  it('always keeps "every desktop + over full-screen apps", whatever the window asks for later', () => {
    const w = Number(createInstance(Win, 0));
    makePanel(rt, w, flags);
    set(w, 'setCollectionBehavior:', 2 | 4 | 32); // e.g. Chromium resetting it
    expect(get(w, 'collectionBehavior')).toBe(4 | 32 | 1 | 256);
  });

  it('is done once per window; later windows reuse the patched class', () => {
    const a = Number(createInstance(Win, 0));
    const b = Number(createInstance(Win, 0));
    makePanel(rt, a, flags);
    expect(makePanel(rt, a, flags)).toBe('already a panel');
    expect(makePanel(rt, b, flags)).toBe('panel (reused FakeVideoWindow)');
    expect(get(b, 'styleMask')).toBe(32776 | NAP);
  });

  it('works for a window whose class only inherits the methods (a watched window)', () => {
    const w = Number(createInstance(Watched, 0));
    const plain = Number(createInstance(Win, 0));
    expect(makePanel(rt, w, flags)).toBe('panel (patched NSKVONotifying_FakeVideoWindow)');
    expect(get(w, 'styleMask')).toBe(32776 | NAP);
    expect(get(plain, 'styleMask')).toBe(32776);
    expect(String(className(w))).toBe('NSKVONotifying_FakeVideoWindow');
  });
});

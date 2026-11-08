// The "make it a panel" trick, run against GCC's Objective-C runtime on Linux
// (macOS's runtime has the same functions). Skipped where libobjc isn't installed.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { makePanel, type ClassRuntime } from '../../src/main/objcPanel';

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
  const setClass = fn('object_setClass', P, [P, P]);
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

  const rt: ClassRuntime = {
    koffi,
    sel,
    // GCC doesn't export object_getClass; look the class up by name instead.
    objectGetClass: (o) => Number(lookUpClass(className(o))),
    className: (o) => String(className(o)),
    lookUpClass: (n) => Number(lookUpClass(n) ?? 0),
    allocateClassPair: (c, n) => Number(allocPair(c, n, 0) ?? 0),
    registerClassPair: (c) => void regPair(c),
    getImp: (c, s) => getImp(c, s),
    addMethod: (c, s, imp, t) => !!addMethod(c, s, imp, t),
    setClass: (o, c) => void setClass(o, c),
  };

  it('the window then reports the panel flag, keeping its own flags', () => {
    const w = Number(createInstance(Win, 0));
    expect(get(w, 'styleMask')).toBe(32776);
    expect(makePanel(rt, w, flags)).toBe('now KitePanel_FakeVideoWindow');
    expect(get(w, 'styleMask')).toBe(32776 | NAP);
  });

  it('always keeps "every desktop + over full-screen apps", whatever the window asks for later', () => {
    const w = Number(createInstance(Win, 0));
    makePanel(rt, w, flags);
    set(w, 'setCollectionBehavior:', 2 | 4 | 32); // e.g. Chromium resetting it
    expect(get(w, 'collectionBehavior')).toBe(4 | 32 | 1 | 256);
  });

  it('is done once per window, and the new class is shared by later windows', () => {
    const a = Number(createInstance(Win, 0));
    const b = Number(createInstance(Win, 0));
    makePanel(rt, a, flags);
    expect(makePanel(rt, a, flags)).toBe('already a panel');
    expect(makePanel(rt, b, flags)).toBe('now KitePanel_FakeVideoWindow');
    expect(get(b, 'styleMask')).toBe(32776 | NAP);
  });
});

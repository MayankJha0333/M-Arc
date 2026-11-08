import { describe, expect, it } from 'vitest';
import { compactBounds, fromCocoa, isCompact, toCocoa, COMPACT_WIDTH } from '@shared/pipFrame';

const screenH = 1117;
const workArea = { x: 0, y: 38, width: 1728, height: 1079 }; // below the menu bar

describe('floating video frame geometry', () => {
  it('converts between macOS (bottom-left) and screen (top-left) coordinates', () => {
    const cocoa = { x: 100, y: 50, width: 480, height: 270 };
    const b = fromCocoa(cocoa, screenH);
    expect(b).toEqual({ x: 100, y: screenH - 50 - 270, width: 480, height: 270 });
    expect(toCocoa(b, screenH)).toEqual(cocoa);
  });

  it('minimize shrinks it, keeps its shape, and tucks it into the nearest corner', () => {
    // bottom-right quarter → bottom-right corner
    const br = compactBounds({ x: 1200, y: 800, width: 480, height: 270 }, workArea);
    expect(br.width).toBe(COMPACT_WIDTH);
    expect(br.height).toBe(135);
    expect(br.x + br.width).toBe(1728 - 16);
    expect(br.y + br.height).toBe(38 + 1079 - 16);
    // top-left quarter → top-left corner, below the menu bar
    const tl = compactBounds({ x: 40, y: 60, width: 480, height: 270 }, workArea);
    expect(tl).toMatchObject({ x: 16, y: 38 + 16 });
  });

  it('tall videos stay tall; tiny ones are not made bigger', () => {
    const tall = compactBounds({ x: 0, y: 0, width: 360, height: 640 }, workArea);
    expect(tall.width).toBe(240);
    expect(tall.height).toBe(Math.round(240 * (640 / 360)));
    const tiny = compactBounds({ x: 0, y: 0, width: 200, height: 112 }, workArea);
    expect(tiny.width).toBe(200);
    expect(tiny.height).toBe(112);
  });

  it('knows when it is already minimized', () => {
    expect(isCompact({ x: 0, y: 0, width: 240, height: 135 })).toBe(true);
    expect(isCompact({ x: 0, y: 0, width: 480, height: 270 })).toBe(false);
  });
});

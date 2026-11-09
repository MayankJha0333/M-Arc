import { describe, expect, it } from 'vitest';
import { dragTo, fromCocoa, insetBounds, miniBounds, toCocoa, MINI_SIZE, FRAME_INSET } from '@shared/pipFrame';
import { formatTime, isPipMediaCommand, MEDIA_STATE_SCRIPT, pipMediaScript, PIP_REENTER_SCRIPT, PIP_TO_MINI_SCRIPT } from '@shared/pip';

const screenH = 1117;
const workArea = { x: 0, y: 38, width: 1728, height: 1079 }; // below the menu bar

describe('floating video frame geometry', () => {
  it('converts between macOS (bottom-left) and screen (top-left) coordinates', () => {
    const cocoa = { x: 100, y: 50, width: 480, height: 270 };
    const b = fromCocoa(cocoa, screenH);
    expect(b).toEqual({ x: 100, y: screenH - 50 - 270, width: 480, height: 270 });
    expect(toCocoa(b, screenH)).toEqual(cocoa);
  });

  it('the frame sits just inside the video window, leaving its edges free for resizing', () => {
    expect(insetBounds({ x: 100, y: 200, width: 480, height: 270 })).toEqual({
      x: 100 + FRAME_INSET,
      y: 200 + FRAME_INSET,
      width: 480 - FRAME_INSET * 2,
      height: 270 - FRAME_INSET * 2,
    });
    expect(insetBounds({ x: 0, y: 0, width: 4, height: 4 }).width).toBe(0);
  });

  it('the mini player goes to the bottom-right corner of the screen, above the Dock', () => {
    const m = miniBounds(workArea);
    expect(m.width).toBe(MINI_SIZE.width);
    expect(m.x + m.width).toBe(1728 - 12);
    expect(m.y + m.height).toBe(38 + 1079 - 12);
  });

  it('dragging moves the window by exactly how far the mouse moved', () => {
    const start = { x: 900, y: 600, width: 480, height: 270 };
    expect(dragTo(start, { x: 1000, y: 700 }, { x: 940, y: 520 })).toEqual({ x: 840, y: 420, width: 480, height: 270 });
  });
});

describe('controlling the floating video', () => {
  it('formats times like a video player', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('accepts only well-formed commands (they come from another window)', () => {
    expect(isPipMediaCommand({ cmd: 'toggle' })).toBe(true);
    expect(isPipMediaCommand({ cmd: 'seek', t: 12.5 })).toBe(true);
    expect(isPipMediaCommand({ cmd: 'skip', by: -10 })).toBe(true);
    expect(isPipMediaCommand({ cmd: 'seek', t: -1 })).toBe(false);
    expect(isPipMediaCommand({ cmd: 'seek', t: 'alert(1)' })).toBe(false);
    expect(isPipMediaCommand({ cmd: 'skip', by: Infinity })).toBe(false);
    expect(isPipMediaCommand({ cmd: 'eval' })).toBe(false);
    expect(isPipMediaCommand(null)).toBe(false);
  });

  /** A pretend page with one video. */
  function page(v: Record<string, unknown>, inPip = true) {
    const doc = {
      pictureInPictureElement: inPip ? v : null,
      exitPictureInPicture: async () => {
        doc.pictureInPictureElement = null;
      },
    } as Record<string, unknown>;
    const win: Record<string, unknown> = { __kitePipVideo: v };
    const run = (code: string) => new Function('window', 'document', `return ${code}`)(win, doc);
    return { doc, win, run };
  }
  const video = (o: Record<string, unknown> = {}) => {
    const v: Record<string, unknown> = {
      currentTime: 100,
      duration: 660,
      paused: false,
      isConnected: true,
      play: async () => void (v.paused = false),
      pause: () => void (v.paused = true),
      requestPictureInPicture: async () => undefined,
      ...o,
    };
    return v;
  };

  it('reads where the video is', () => {
    const v = video();
    expect(page(v).run(MEDIA_STATE_SCRIPT)).toEqual({ t: 100, d: 660, paused: false, pip: true });
    // Live streams have no length: no slider.
    expect(page(video({ duration: Infinity })).run(MEDIA_STATE_SCRIPT).d).toBe(0);
    // Still found while it's in the mini player (out of the floating window).
    expect(page(v, false).run(MEDIA_STATE_SCRIPT)).toMatchObject({ t: 100, pip: false });
    expect(page(video({ isConnected: false }), false).run(MEDIA_STATE_SCRIPT)).toBeNull();
  });

  it('play/pause, seek (drag the slider back) and skip 10 seconds', async () => {
    const v = video();
    const p = page(v);
    await p.run(pipMediaScript({ cmd: 'toggle' }));
    expect(v.paused).toBe(true);
    await p.run(pipMediaScript({ cmd: 'toggle' }));
    expect(v.paused).toBe(false);
    await p.run(pipMediaScript({ cmd: 'seek', t: 42 }));
    expect(v.currentTime).toBe(42);
    await p.run(pipMediaScript({ cmd: 'seek', t: 9999 }));
    expect(v.currentTime).toBe(660); // not past the end
    await p.run(pipMediaScript({ cmd: 'skip', by: -10 }));
    expect(v.currentTime).toBe(650);
    await p.run(pipMediaScript({ cmd: 'seek', t: 4 }));
    await p.run(pipMediaScript({ cmd: 'skip', by: -10 }));
    expect(v.currentTime).toBe(0); // not before the start
  });

  it('minimize leaves the floating window but keeps playing; "show video" pops the same video out again', async () => {
    let popped = 0;
    const v = video({ requestPictureInPicture: async () => void popped++ });
    const p = page(v);
    expect(await p.run(PIP_TO_MINI_SCRIPT)).toBe(true);
    expect(p.doc.pictureInPictureElement).toBeNull();
    expect(v.paused).toBe(false);
    v.paused = true; // even if you paused it in the mini player
    expect(await p.run(PIP_REENTER_SCRIPT)).toBe('ok');
    expect(popped).toBe(1);
  });
});

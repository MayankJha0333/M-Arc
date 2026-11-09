import { describe, expect, it } from 'vitest';
import { dragTo, fromCocoa, miniBounds, resizeTo, toCocoa, MINI_SIZE, MIN_VIDEO_WIDTH } from '@shared/pipFrame';
import { formatTime, isPipMediaCommand, isThumb, MEDIA_STATE_SCRIPT, pipMediaScript, PIP_REENTER_SCRIPT, PIP_TO_MINI_SCRIPT } from '@shared/pip';

const screenH = 1117;
const workArea = { x: 0, y: 38, width: 1728, height: 1079 }; // below the menu bar

describe('floating video frame geometry', () => {
  it('converts between macOS (bottom-left) and screen (top-left) coordinates', () => {
    const cocoa = { x: 100, y: 50, width: 480, height: 270 };
    const b = fromCocoa(cocoa, screenH);
    expect(b).toEqual({ x: 100, y: screenH - 50 - 270, width: 480, height: 270 });
    expect(toCocoa(b, screenH)).toEqual(cocoa);
  });

  it('resizing from a corner keeps the video’s shape and keeps the opposite corner still', () => {
    const start = { x: 1000, y: 600, width: 480, height: 270 };
    const se = resizeTo(start, 'se', { x: 1480, y: 870 }, { x: 1560, y: 880 }, 1600);
    expect(se).toEqual({ x: 1000, y: 600, width: 560, height: 315 });
    const nw = resizeTo(start, 'nw', { x: 1000, y: 600 }, { x: 900, y: 590 }, 1600);
    expect(nw.width).toBe(580);
    expect(nw.x + nw.width).toBe(1480); // right edge stays
    expect(nw.y + nw.height).toBe(870); // bottom edge stays
  });

  it('resizing from a side grows from the middle; it never gets too small or too big', () => {
    const start = { x: 1000, y: 600, width: 480, height: 270 };
    const s = resizeTo(start, 's', { x: 0, y: 0 }, { x: 0, y: 54 }, 1600);
    expect(s.width).toBe(576);
    expect(s.x + s.width / 2).toBe(1240); // centred
    expect(s.y).toBe(600);
    expect(resizeTo(start, 'e', { x: 0, y: 0 }, { x: -900, y: 0 }, 1600).width).toBe(MIN_VIDEO_WIDTH);
    expect(resizeTo(start, 'e', { x: 0, y: 0 }, { x: 5000, y: 0 }, 1200).width).toBe(1200);
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

  it('only a small JPEG snapshot reaches the mini player', () => {
    expect(isThumb('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isThumb('data:text/html,<script>')).toBe(false);
    expect(isThumb('https://example.com/a.jpg')).toBe(false);
    expect(isThumb('data:image/jpeg;base64,' + 'A'.repeat(200_000))).toBe(false);
    expect(isThumb(null)).toBe(false);
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

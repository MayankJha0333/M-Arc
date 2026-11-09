// Geometry for Kite's frame around the floating video (border + Back / Minimize /
// Close). macOS measures windows from the bottom-left of the main screen; Electron
// from the top-left — these helpers convert, and work out the "minimized" size.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** macOS window frame (origin bottom-left of the main screen) → Electron screen bounds. */
export function fromCocoa(frame: Rect, mainScreenHeight: number): Rect {
  return { x: Math.round(frame.x), y: Math.round(mainScreenHeight - frame.y - frame.height), width: Math.round(frame.width), height: Math.round(frame.height) };
}

/** Electron screen bounds → macOS window frame. */
export function toCocoa(bounds: Rect, mainScreenHeight: number): Rect {
  return { x: bounds.x, y: mainScreenHeight - bounds.y - bounds.height, width: bounds.width, height: bounds.height };
}

/** The frame sits this far inside the video window, so its edges stay grabbable for resizing. */
export const FRAME_INSET = 5;

export function insetBounds(b: Rect, by = FRAME_INSET): Rect {
  return { x: b.x + by, y: b.y + by, width: Math.max(0, b.width - by * 2), height: Math.max(0, b.height - by * 2) };
}

/** Size of the mini player's window (the card plus room for its shadow). */
export const MINI_SIZE = { width: 360, height: 104 } as const;
const MARGIN = 12;

/** Mini player: bottom-right corner of the screen the video was on. */
export function miniBounds(workArea: Rect): Rect {
  return {
    x: workArea.x + workArea.width - MINI_SIZE.width - MARGIN,
    y: workArea.y + workArea.height - MINI_SIZE.height - MARGIN,
    width: MINI_SIZE.width,
    height: MINI_SIZE.height,
  };
}

/** Where a dragged window goes: its start position moved by how far the mouse moved. */
export function dragTo(start: Rect, from: { x: number; y: number }, to: { x: number; y: number }): Rect {
  return { ...start, x: Math.round(start.x + to.x - from.x), y: Math.round(start.y + to.y - from.y) };
}

export type PipFrameMode = 'full' | 'mini';
export type PipFrameAction = 'back' | 'minimize' | 'show' | 'close';
export const PIP_FRAME_ACTIONS: readonly PipFrameAction[] = ['back', 'minimize', 'show', 'close'];

/** What the frame shows: where the video is, and which layout. */
export interface PipFrameState {
  mode: PipFrameMode;
  t: number;
  /** 0 = live or unknown length (no slider). */
  d: number;
  paused: boolean;
  title: string;
  host: string;
}

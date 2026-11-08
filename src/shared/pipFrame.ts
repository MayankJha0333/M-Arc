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

export const COMPACT_WIDTH = 240;
export const COMPACT_MIN_HEIGHT = 135;
const MARGIN = 16;

/**
 * "Minimize": shrink the video (keeping its shape) and tuck it into the screen
 * corner nearest to where it is now. `workArea` is the screen minus menu bar/Dock.
 */
export function compactBounds(current: Rect, workArea: Rect): Rect {
  const ratio = current.height / Math.max(1, current.width);
  const width = Math.min(COMPACT_WIDTH, current.width);
  const height = Math.max(Math.min(COMPACT_MIN_HEIGHT, current.height), Math.round(width * ratio));
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  const right = cx >= workArea.x + workArea.width / 2;
  const bottom = cy >= workArea.y + workArea.height / 2;
  return {
    x: right ? workArea.x + workArea.width - width - MARGIN : workArea.x + MARGIN,
    y: bottom ? workArea.y + workArea.height - height - MARGIN : workArea.y + MARGIN,
    width,
    height,
  };
}

/** Is the window already at (about) its minimized size? */
export function isCompact(current: Rect): boolean {
  return current.width <= COMPACT_WIDTH + 2;
}

export type PipFrameAction = 'back' | 'minimize' | 'close';
export const PIP_FRAME_ACTIONS: readonly PipFrameAction[] = ['back', 'minimize', 'close'];

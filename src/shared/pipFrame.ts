// Geometry and state for Kite's floating video controls and mini player.
// macOS measures windows from the bottom-left of the main screen; Electron from the
// top-left — these helpers convert, move, resize and place the mini player.

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

/** Edges and corners you can drag to resize the floating video. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const MIN_VIDEO_WIDTH = 220;

/**
 * Resize from an edge or corner, keeping the video's shape. The opposite edge
 * (or corner) stays put; side edges grow from the middle.
 */
export function resizeTo(start: Rect, edge: ResizeEdge, from: { x: number; y: number }, to: { x: number; y: number }, maxWidth: number): Rect {
  const ratio = start.height / Math.max(1, start.width);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const h = edge.includes('e') ? dx : edge.includes('w') ? -dx : 0;
  const v = edge.includes('s') ? dy : edge.includes('n') ? -dy : 0;
  // Follow whichever direction the mouse moved further (in width terms).
  const grow = Math.abs(h) >= Math.abs(v / ratio) ? h : v / ratio;
  const width = Math.round(Math.max(MIN_VIDEO_WIDTH, Math.min(maxWidth, start.width + grow)));
  const height = Math.round(width * ratio);
  let x = start.x;
  let y = start.y;
  if (edge.includes('w')) x = start.x + start.width - width;
  else if (edge === 'n' || edge === 's') x = Math.round(start.x + (start.width - width) / 2);
  if (edge.includes('n')) y = start.y + start.height - height;
  else if (edge === 'e' || edge === 'w') y = Math.round(start.y + (start.height - height) / 2);
  return { x, y, width, height };
}

/** Size of the mini player's window (the card plus room for its shadow). */
export const MINI_SIZE = { width: 320, height: 90 } as const;
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
  /** Mini player: a small snapshot of the video (JPEG data URL). */
  thumb?: string;
}

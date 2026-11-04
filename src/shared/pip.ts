// Automatic picture-in-picture: when a playing video goes out of sight
// (you switch tabs or switch to another app), it pops out into a floating
// window you can move anywhere; when you come back, it returns to the page.

import type { ID } from './types';

export interface PipSettings {
  autoPip: boolean;
  autoPipOnAppSwitch: boolean;
}

export interface PipPlan {
  /** At most one: the system only allows one picture-in-picture window. */
  enter: ID | null;
  exit: ID[];
}

/**
 * Pages were shown (`before`) and now these are shown (`after`).
 * `focused` is the tab that had focus before (preferred when several played).
 */
export function planOnSwitch(before: ID[], after: ID[], playing: Record<ID, boolean>, popped: ID[], s: PipSettings, focused?: ID | null): PipPlan {
  const exit = popped.filter((id) => after.includes(id));
  if (!s.autoPip) return { enter: null, exit };
  const gone = before.filter((id) => !after.includes(id) && playing[id]);
  const enter = focused && gone.includes(focused) ? focused : gone[0] ?? null;
  return { enter, exit };
}

/** Kite lost focus to another app: pop out the visible playing video. */
export function planOnAppBlur(visible: ID[], playing: Record<ID, boolean>, s: PipSettings, focused?: ID | null): PipPlan {
  if (!s.autoPip || !s.autoPipOnAppSwitch) return { enter: null, exit: [] };
  const candidates = visible.filter((id) => playing[id]);
  const enter = focused && candidates.includes(focused) ? focused : candidates[0] ?? null;
  return { enter, exit: [] };
}

/** Kite is back in front: bring videos we popped out of visible pages back. */
export function planOnAppFocus(visible: ID[], popped: ID[]): PipPlan {
  return { enter: null, exit: popped.filter((id) => visible.includes(id)) };
}

/**
 * Script run inside a page (and each of its frames) to pop out its main video.
 * Picks the largest playing video that has sound or is reasonably big, so
 * small muted autoplay ads don't pop out. Resolves true if a video popped out.
 */
export const PIP_ENTER_SCRIPT = `(async () => {
  if (!document.pictureInPictureEnabled) return false;
  if (document.pictureInPictureElement) return true;
  const vids = Array.from(document.querySelectorAll('video')).filter((v) =>
    !v.paused && !v.ended && v.readyState >= 2 && v.videoWidth > 0 && !v.disablePictureInPicture &&
    ((!v.muted && v.volume > 0) || v.clientWidth >= 480));
  if (!vids.length) return false;
  vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  try { await vids[0].requestPictureInPicture(); return true; } catch (e) { return false; }
})()`;

export const PIP_EXIT_SCRIPT = `(async () => {
  if (document.pictureInPictureElement) { try { await document.exitPictureInPicture(); } catch (e) {} return true; }
  return false;
})()`;

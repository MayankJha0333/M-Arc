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

/**
 * Runs in every frame of a page that may play video: remembers when each video
 * last played, and whether a pause came from you (page in front) or from the
 * system (page going to the background — Chrome pauses some background videos,
 * e.g. muted ones, the moment you switch away). Safe to run more than once.
 */
export const MEDIA_TRACKER_SCRIPT = `(() => {
  if (window.__kiteMediaTracker) return;
  window.__kiteMediaTracker = true;
  const isMedia = (t) => t && typeof t.paused === 'boolean' && typeof t.play === 'function';
  document.addEventListener('timeupdate', (e) => { if (isMedia(e.target) && !e.target.paused) e.target.__kitePlayedAt = Date.now(); }, true);
  document.addEventListener('play', (e) => { if (isMedia(e.target)) { e.target.__kiteUserPause = false; e.target.__kitePlayedAt = Date.now(); } }, true);
  document.addEventListener('pause', (e) => {
    if (isMedia(e.target)) e.target.__kiteUserPause = document.visibilityState === 'visible' && document.hasFocus();
  }, true);
})()`;

/**
 * Script run inside a page (and each of its frames) to pop out its main video.
 * Picks the largest playing video that has sound or is reasonably big, so
 * small muted autoplay ads don't pop out. A video the system paused a moment ago
 * (because you were switching away) counts as playing, and is resumed.
 * Resolves to a short status: 'ok', 'ok (resumed)', 'already', or why nothing
 * popped out ('off', 'none', 'skipped …', 'error …') — written to the debug log.
 */
export const PIP_ENTER_SCRIPT = `(async () => {
  if (!document.pictureInPictureEnabled) return 'off';
  if (document.pictureInPictureElement) return 'already';
  const all = Array.from(document.querySelectorAll('video'));
  if (!all.length) return 'none';
  const usable = (v) => !v.ended && v.readyState >= 2 && v.videoWidth > 0 && !v.disablePictureInPicture &&
    ((!v.muted && v.volume > 0) || v.clientWidth >= 480);
  const justStopped = (v) => v.paused && v.__kiteUserPause !== true && Date.now() - (v.__kitePlayedAt || 0) < 2000;
  const bySize = (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight;
  let vids = all.filter((v) => !v.paused && usable(v)).sort(bySize);
  let resume = false;
  if (!vids.length) { vids = all.filter((v) => justStopped(v) && usable(v)).sort(bySize); resume = vids.length > 0; }
  if (!vids.length) return 'skipped ' + all.map((v) => (v.paused ? (v.__kiteUserPause ? 'paused-by-you' : 'paused') : 'playing') + '/' + v.readyState + '/' + v.clientWidth + (v.muted ? '/muted' : '')).join(',');
  try {
    await vids[0].requestPictureInPicture();
    if (resume) { try { await vids[0].play(); } catch (e) {} return 'ok (resumed)'; }
    return 'ok';
  } catch (e) { return 'error ' + (e && e.name) + ': ' + (e && e.message); }
})()`;

/** True when a status from PIP_ENTER_SCRIPT means a video is floating. */
export const pipPopped = (status: unknown) => typeof status === 'string' && (/^ok\b/.test(status) || status === 'already');

/** Close button on the floating window: put the video back and pause it. */
export const PIP_CLOSE_SCRIPT = `(async () => {
  const v = document.pictureInPictureElement;
  if (!v) return false;
  try { await document.exitPictureInPicture(); } catch (e) {}
  try { v.pause(); } catch (e) {}
  return true;
})()`;

export const PIP_EXIT_SCRIPT = `(async () => {
  if (document.pictureInPictureElement) { try { await document.exitPictureInPicture(); } catch (e) {} return true; }
  return false;
})()`;

/**
 * Pages Kite should try to pop a video out of when you switch to another app,
 * best first (the focused pane). The main process acts on this list the moment
 * Kite stops being the active app, without asking the UI first.
 */
export function appSwitchTargets(visible: ID[], s: PipSettings, focused?: ID | null): ID[] {
  if (!s.autoPip || !s.autoPipOnAppSwitch) return [];
  return focused && visible.includes(focused) ? [focused, ...visible.filter((id) => id !== focused)] : [...visible];
}

/** Is any video or audio on this page (frame) still playing? Pages often have several. */
export const MEDIA_PLAYING_SCRIPT = `Array.from(document.querySelectorAll('video, audio')).some((m) => !m.paused && !m.ended)`;

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
 * system (page going to the background — Chrome and some sites pause videos the
 * moment you switch away or swipe to another desktop). Safe to run more than once.
 */
export const MEDIA_TRACKER_SCRIPT = `(() => {
  if (window.__kiteMediaTracker) return;
  window.__kiteMediaTracker = true;
  const isMedia = (t) => t && typeof t.paused === 'boolean' && typeof t.play === 'function';
  // A pause is yours only if you clicked, tapped or pressed a key in the page just before.
  // (Being "in front" isn't enough: while you swipe to another desktop Kite still is.)
  let lastInput = 0;
  const input = () => { lastInput = Date.now(); };
  for (const t of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(t, input, true);
  document.addEventListener('timeupdate', (e) => { if (isMedia(e.target) && !e.target.paused) e.target.__kitePlayedAt = Date.now(); }, true);
  document.addEventListener('play', (e) => { if (isMedia(e.target)) { e.target.__kiteUserPause = false; e.target.__kitePlayedAt = Date.now(); } }, true);
  document.addEventListener('pause', (e) => {
    if (!isMedia(e.target)) return;
    e.target.__kitePausedAt = Date.now();
    e.target.__kiteUserPause = Date.now() - lastInput < 1500 && document.visibilityState === 'visible';
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
  const usable = (v) => !v.ended && v.readyState >= 1 && v.videoWidth > 0 && !v.disablePictureInPicture &&
    ((!v.muted && v.volume > 0) || v.clientWidth >= 480);
  // Stopped a split second ago (the switch itself paused it, whatever the cause), or
  // stopped in the last two seconds without a click or key from you.
  const justStopped = (v) => v.paused && (
    (v.__kitePausedAt && Date.now() - v.__kitePausedAt < 700) ||
    (v.__kiteUserPause !== true && Date.now() - (v.__kitePlayedAt || 0) < 2000));
  const bySize = (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight;
  let vids = all.filter((v) => !v.paused && usable(v)).sort(bySize);
  let resume = false;
  if (!vids.length) { vids = all.filter((v) => justStopped(v) && usable(v)).sort(bySize); resume = vids.length > 0; }
  if (!vids.length) return 'skipped ' + all.map((v) => (v.paused ? (v.__kiteUserPause ? 'paused-by-you' : 'paused') : 'playing') + '/' + v.readyState + '/' + v.clientWidth + (v.muted ? '/muted' : '')).join(',');
  try {
    await vids[0].requestPictureInPicture();
    window.__kitePipVideo = vids[0]; // remembered for the floating controls and the mini player
    if (resume) { try { await vids[0].play(); } catch (e) {} return 'ok (resumed)'; }
    return 'ok';
  } catch (e) { return 'error ' + (e && e.name) + ': ' + (e && e.message); }
})()`;

/** True when a status from PIP_ENTER_SCRIPT means a video is floating. */
export const pipPopped = (status: unknown) => typeof status === 'string' && (/^ok\b/.test(status) || status === 'already');

/** Close on the floating video (or the mini player): put the video back and pause it. */
export const PIP_CLOSE_SCRIPT = `(async () => {
  const v = document.pictureInPictureElement || (window.__kitePipVideo && window.__kitePipVideo.isConnected ? window.__kitePipVideo : null);
  if (!v) return false;
  if (document.pictureInPictureElement) { try { await document.exitPictureInPicture(); } catch (e) {} }
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

// ---- Kite's floating video controls (design D) -----------------------------------

/** The video Kite popped out (or last popped out, while it's in the mini player). */
const PIP_VIDEO = `(document.pictureInPictureElement || (window.__kitePipVideo && window.__kitePipVideo.isConnected ? window.__kitePipVideo : null))`;

/** Where the floating video is: time, length, paused. null if this frame has none. */
export const MEDIA_STATE_SCRIPT = `(() => {
  const v = ${PIP_VIDEO};
  if (!v) return null;
  return { t: v.currentTime || 0, d: Number.isFinite(v.duration) ? v.duration : 0, paused: !!v.paused, pip: document.pictureInPictureElement === v };
})()`;

export type PipMediaCommand = { cmd: 'toggle' } | { cmd: 'play' } | { cmd: 'pause' } | { cmd: 'seek'; t: number } | { cmd: 'skip'; by: number };

/** Is this a well-formed command (it comes from another window, so check it)? */
export function isPipMediaCommand(c: unknown): c is PipMediaCommand {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (o.cmd === 'toggle' || o.cmd === 'play' || o.cmd === 'pause') return true;
  if (o.cmd === 'seek') return typeof o.t === 'number' && Number.isFinite(o.t) && o.t >= 0;
  if (o.cmd === 'skip') return typeof o.by === 'number' && Number.isFinite(o.by) && Math.abs(o.by) <= 600;
  return false;
}

/** Script that applies a command to the floating video. Resolves true if this frame had it. */
export function pipMediaScript(c: PipMediaCommand): string {
  const body =
    c.cmd === 'toggle'
      ? `if (v.paused) { await v.play(); } else { v.pause(); }`
      : c.cmd === 'play'
        ? `await v.play();`
        : c.cmd === 'pause'
          ? `v.pause();`
          : c.cmd === 'seek'
            ? `v.currentTime = Math.min(${Number(c.t)}, Number.isFinite(v.duration) ? v.duration : ${Number(c.t)});`
            : `v.currentTime = Math.max(0, Math.min((v.currentTime || 0) + (${Number(c.by)}), Number.isFinite(v.duration) ? v.duration : Infinity));`;
  return `(async () => { const v = ${PIP_VIDEO}; if (!v) return false; try { ${body} } catch (e) {} return true; })()`;
}

/** Mini player → "Show video": pop the same video out again (even if paused). */
export const PIP_REENTER_SCRIPT = `(async () => {
  const v = ${PIP_VIDEO};
  if (!v) return 'none';
  if (document.pictureInPictureElement === v) return 'already';
  try { await v.requestPictureInPicture(); return 'ok'; } catch (e) { return 'error ' + (e && e.message); }
})()`;

/** Minimize → mini player: leave the floating window but keep playing in the tab. */
export const PIP_TO_MINI_SCRIPT = `(async () => {
  const v = ${PIP_VIDEO};
  if (!v) return false;
  const wasPlaying = !v.paused;
  if (document.pictureInPictureElement) { try { await document.exitPictureInPicture(); } catch (e) {} }
  if (wasPlaying && v.paused) { try { await v.play(); } catch (e) {} }
  return true;
})()`;

/** "1:05", "1:02:03". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** A small square snapshot of the floating video, for the mini player (null if the site forbids it). */
export const PIP_THUMB_SCRIPT = `(() => {
  const v = ${PIP_VIDEO};
  if (!v || !v.videoWidth || !v.videoHeight) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const s = Math.min(v.videoWidth, v.videoHeight);
    c.getContext('2d').drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 96, 96);
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) { return null; }
})()`;

/** Only a small JPEG snapshot is passed on to the mini player. */
export const isThumb = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/jpeg;base64,') && v.length < 120_000;

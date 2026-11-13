// Interface sounds: short, soft tones made on the fly (no audio files).
// Off or quieter in Settings → Appearance → Sound.

import { getS, useKite } from './store';

export type SoundName = 'open' | 'close' | 'switch' | 'pop' | 'done' | 'toggle' | 'error';

/** Each sound is one or two notes: [frequency Hz, start s, length s, wave]. */
const NOTES: Record<SoundName, [number, number, number, OscillatorType][]> = {
  open: [[660, 0, 0.09, 'sine'], [990, 0.045, 0.12, 'sine']],
  close: [[620, 0, 0.08, 'sine'], [415, 0.04, 0.12, 'sine']],
  switch: [[392, 0, 0.14, 'triangle'], [587, 0.03, 0.16, 'sine']],
  pop: [[880, 0, 0.07, 'sine']],
  toggle: [[740, 0, 0.05, 'triangle']],
  done: [[523, 0, 0.12, 'sine'], [659, 0.09, 0.12, 'sine'], [784, 0.18, 0.22, 'sine']],
  error: [[277, 0, 0.14, 'triangle'], [233, 0.1, 0.2, 'triangle']],
};

let ctx: AudioContext | null = null;
/** For tests: every sound asked for, whether or not the system could play it. */
export const played: SoundName[] = [];

export function playSound(name: SoundName, force = false) {
  const s = getS().settings;
  if (!force && (!s.sounds || s.soundVolume <= 0)) return;
  played.push(name);
  if (played.length > 50) played.shift();
  try {
    ctx ??= new AudioContext();
    // Browsers keep audio paused until you've clicked or typed once; until then this is silent.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime + 0.005;
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, s.soundVolume || 0.4)) * 0.16;
    master.connect(ctx.destination);
    for (const [freq, at, len, wave] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      // A quick, click-free attack and a soft tail.
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(1, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      osc.connect(g).connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.02);
    }
  } catch {
    /* no audio device */
  }
}

const tabCount = (items: Record<string, { kind: string }>) => Object.values(items).filter((x) => x.kind === 'tab' || x.kind === 'note').length;

/** Play sounds for what happens in the app: tabs opening and closing, Spaces, panels. */
export function startSounds() {
  if (typeof window !== 'undefined') (window as unknown as { __kiteSounds?: SoundName[] }).__kiteSounds = played;
  useKite.subscribe((st, prev) => {
    if (!st.ui.ready || !prev.ui.ready) return;
    if (st.s.activeSpaceId !== prev.s.activeSpaceId && st.s.spaces.length === prev.s.spaces.length) return playSound('switch');
    if (st.s.items !== prev.s.items) {
      // One tab more or fewer is you opening or closing it; bigger jumps are imports, restores and undo.
      const d = tabCount(st.s.items) - tabCount(prev.s.items);
      if (d === 1) return playSound('open');
      if (d === -1) return playSound('close');
    }
    if (st.ui.panel !== prev.ui.panel && st.ui.panel) return playSound('pop');
    if (st.ui.commandBar && !prev.ui.commandBar) return playSound('pop');
  });
}

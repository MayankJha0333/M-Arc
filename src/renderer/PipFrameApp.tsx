// Kite's floating video controls — design D ("Corner buttons").
// Full: covers the video. Close and Minimize as round buttons top-left, Back to tab
// top-right, play/pause and 10-second skips in the middle, a seek slider at the
// bottom. Drag anywhere else to move the video.
// Mini: a small card in the corner (the video keeps playing in its tab) with
// play/pause, Show video, Close and its own slider.

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, CornerUpLeft, Minus, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { formatTime } from '@shared/pip';
import type { PipFrameState } from '@shared/pipFrame';
import { bridge } from './platform';

const HIDE_AFTER_MS = 2200;
const EMPTY: PipFrameState = { mode: 'full', t: 0, d: 0, paused: false, title: '', host: '' };

export function PipFrameApp() {
  const [st, setSt] = useState<PipFrameState>(EMPTY);
  const [awake, setAwake] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    bridge.pipFrameDrag('end');
  };

  useEffect(() => {
    document.documentElement.classList.add('pip-frame-doc');
    return bridge.onPipFrameState((v) => setSt(v));
  }, []);

  // Controls show while the mouse moves over the video, and fade after a moment.
  const wake = () => {
    setAwake(true);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAwake(false), HIDE_AFTER_MS);
  };

  const media = (cmd: Parameters<typeof bridge.pipFrameMedia>[0]) => {
    bridge.pipFrameMedia(cmd);
    if (cmd.cmd === 'toggle') setSt((s) => ({ ...s, paused: !s.paused }));
    if (cmd.cmd === 'skip') setSt((s) => ({ ...s, t: Math.max(0, Math.min(s.d || Infinity, s.t + cmd.by)) }));
    if (cmd.cmd === 'seek') setSt((s) => ({ ...s, t: cmd.t }));
  };

  const time = scrub ?? st.t;
  const shown = awake || st.paused || scrub !== null;
  const playLabel = st.paused ? 'Play' : 'Pause';

  if (st.mode === 'mini') {
    return (
      <div className="pipd-mini-wrap" data-testid="pip-frame" data-mode="mini">
        <div className="pipd-mini" data-scrubbing={scrub !== null || undefined}>
          <div className="pipd-mini-row">
            <div className="pipd-mini-thumb" aria-hidden="true">
              <span className="pipd-eq" data-paused={st.paused || undefined}>
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="pipd-mini-text">
              <div className="pipd-mini-title" title={st.title}>
                {st.title || st.host || 'Video'}
              </div>
              <div className="pipd-mini-sub">
                {st.host && <span>{st.host} · </span>}
                <span data-testid="pip-time">{formatTime(time)}</span>
                {st.d > 0 && <span> / {formatTime(st.d)}</span>}
              </div>
            </div>
            <button className="pipd-mini-btn" data-testid="pip-play" aria-label={playLabel} title={playLabel} onClick={() => media({ cmd: 'toggle' })}>
              {st.paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
            </button>
            <button className="pipd-mini-btn pipd-mini-show" data-testid="pip-frame-show" aria-label="Show video" title="Show video" onClick={() => bridge.pipFrameAction('show')}>
              <ChevronUp size={16} />
            </button>
            <button className="pipd-mini-btn" data-testid="pip-frame-close" aria-label="Close" title="Close" onClick={() => bridge.pipFrameAction('close')}>
              <X size={15} />
            </button>
          </div>
          {st.d > 0 && <Seek t={time} d={st.d} onScrub={setScrub} onSeek={(t) => media({ cmd: 'seek', t })} />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pipd"
      data-testid="pip-frame"
      data-mode="full"
      data-shown={shown || undefined}
      onMouseMove={wake}
      onMouseLeave={() => setAwake(false)}
      onPointerDown={(e) => {
        // Drag anywhere that isn't a control: move the video.
        if ((e.target as HTMLElement).closest('button, input')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        bridge.pipFrameDrag('start');
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <div className="pipd-scrim pipd-scrim-top" />
      <div className="pipd-scrim pipd-scrim-bottom" />

      <div className="pipd-corner">
        <button className="pipd-round" data-testid="pip-frame-close" aria-label="Close" title="Close" onClick={() => bridge.pipFrameAction('close')}>
          <X size={12} strokeWidth={3} />
        </button>
        <button className="pipd-round" data-testid="pip-frame-minimize" aria-label="Minimize to mini player" title="Minimize to mini player" onClick={() => bridge.pipFrameAction('minimize')}>
          <Minus size={12} strokeWidth={3} />
        </button>
      </div>
      <button className="pipd-back" data-testid="pip-frame-back" aria-label="Back to tab" onClick={() => bridge.pipFrameAction('back')}>
        <CornerUpLeft size={12} strokeWidth={2.4} />
        Back to tab
      </button>

      <div className="pipd-center">
        {st.d > 0 && (
          <button className="pipd-skip" data-testid="pip-back10" aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => media({ cmd: 'skip', by: -10 })}>
            <RotateCcw size={18} />
            <span>10</span>
          </button>
        )}
        <button className="pipd-play" data-testid="pip-play" aria-label={playLabel} title={playLabel} onClick={() => media({ cmd: 'toggle' })}>
          {st.paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
        </button>
        {st.d > 0 && (
          <button className="pipd-skip" data-testid="pip-fwd10" aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => media({ cmd: 'skip', by: 10 })}>
            <RotateCw size={18} />
            <span>10</span>
          </button>
        )}
      </div>

      <div className="pipd-bottom">
        <span data-testid="pip-time">{formatTime(time)}</span>
        {st.d > 0 ? (
          <>
            <Seek t={time} d={st.d} onScrub={setScrub} onSeek={(t) => media({ cmd: 'seek', t })} />
            <span>{formatTime(st.d)}</span>
          </>
        ) : (
          <span className="pipd-live">Live</span>
        )}
      </div>
    </div>
  );
}

/** The slider: drag (or click) to jump to any moment — e.g. back to where you were. */
function Seek({ t, d, onScrub, onSeek }: { t: number; d: number; onScrub: (t: number | null) => void; onSeek: (t: number) => void }) {
  const lastSent = useRef(0);
  const dragging = useRef(false);
  const pct = d > 0 ? Math.min(100, Math.max(0, (t / d) * 100)) : 0;
  const end = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    onSeek(Number(e.currentTarget.value));
    onScrub(null);
  };
  return (
    <div className="pipd-seek">
      <div className="pipd-track">
        <div className="pipd-fill" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(d))}
        step={1}
        value={Math.floor(t)}
        aria-label="Video position"
        aria-valuetext={`${formatTime(t)} of ${formatTime(d)}`}
        data-testid="pip-seek"
        onPointerDown={() => (dragging.current = true)}
        onChange={(e) => {
          const v = Number(e.target.value);
          onScrub(v);
          // While dragging, move the video along (a few times a second); keyboard changes apply at once.
          const now = Date.now();
          if (!dragging.current || now - lastSent.current > 120) {
            lastSent.current = now;
            onSeek(v);
          }
          if (!dragging.current) onScrub(null);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}

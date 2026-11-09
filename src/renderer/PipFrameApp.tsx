// Kite's floating video controls — design D ("Corner buttons").
// Full: covers the video exactly. Close and Minimize as round buttons top-left,
// Back to tab top-right, play/pause and 10-second skips in the middle, a seek slider
// at the bottom. Drag the video to move it; drag an edge or corner to resize it.
// Mini: a compact card in the corner (the video keeps playing in its tab) with a
// snapshot of the video, play/pause, Show video, Close and a slim slider.

import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Maximize2, Minus, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { formatTime } from '@shared/pip';
import { RESIZE_EDGES, type PipFrameState, type ResizeEdge } from '@shared/pipFrame';
import { bridge } from './platform';

const HIDE_AFTER_MS = 2200;
const EMPTY: PipFrameState = { mode: 'full', t: 0, d: 0, paused: false, title: '', host: '' };

export function PipFrameApp() {
  const [st, setSt] = useState<PipFrameState>(EMPTY);
  const [awake, setAwake] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add('pip-frame-doc');
    return bridge.onPipFrameState((v) => setSt(v));
  }, []);

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    bridge.pipFrameDrag('end');
  };
  const beginDrag = (e: React.PointerEvent<HTMLElement>, edge?: ResizeEdge) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    bridge.pipFrameDrag('start', edge);
  };

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
  const PlayIcon = st.paused ? Play : Pause;

  if (st.mode === 'mini') {
    const pct = st.d > 0 ? Math.min(100, (time / st.d) * 100) : 0;
    return (
      <div className="pipm-wrap" data-testid="pip-frame" data-mode="mini">
        <div className="pipm" data-scrubbing={scrub !== null || undefined}>
          <div className="pipm-thumb" aria-hidden="true">
            {st.thumb ? <img src={st.thumb} alt="" draggable={false} /> : <div className="pipm-thumb-blank" />}
            {!st.paused && (
              <span className="pipm-eq">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <div className="pipm-text">
            <div className="pipm-title" title={st.title}>
              {st.title || st.host || 'Video'}
            </div>
            <div className="pipm-sub">
              <span data-testid="pip-time">{formatTime(time)}</span>
              {st.d > 0 && <span className="pipm-dim"> / {formatTime(st.d)}</span>}
              {st.host && <span className="pipm-dim"> · {st.host}</span>}
            </div>
          </div>
          <div className="pipm-actions">
            <button className="pipm-play" data-testid="pip-play" aria-label={playLabel} title={playLabel} onClick={() => media({ cmd: 'toggle' })}>
              <PlayIcon size={14} fill="currentColor" strokeWidth={0} />
            </button>
            <button className="pipm-btn" data-testid="pip-frame-show" aria-label="Show video" title="Show video" onClick={() => bridge.pipFrameAction('show')}>
              <Maximize2 size={14} />
            </button>
            <button className="pipm-btn" data-testid="pip-frame-close" aria-label="Close" title="Close" onClick={() => bridge.pipFrameAction('close')}>
              <X size={15} />
            </button>
          </div>
          {st.d > 0 && (
            <div className="pipm-progress">
              <Seek t={time} d={st.d} pct={pct} onScrub={setScrub} onSeek={(t) => media({ cmd: 'seek', t })} />
            </div>
          )}
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
      data-rounded={st.rounded || undefined}
      onMouseMove={wake}
      onMouseLeave={() => setAwake(false)}
      onPointerDown={(e) => {
        // Drag anywhere that isn't a control: move the video.
        if ((e.target as HTMLElement).closest('button, input, .pipd-edge')) return;
        beginDrag(e);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <div className="pipd-ring" />

      <div className="pipd-corner">
        <button className="pipd-round pipd-close" data-testid="pip-frame-close" aria-label="Close" title="Close" onClick={() => bridge.pipFrameAction('close')}>
          <X size={11} strokeWidth={3} />
        </button>
        <button className="pipd-round" data-testid="pip-frame-minimize" aria-label="Minimize to mini player" title="Minimize to mini player" onClick={() => bridge.pipFrameAction('minimize')}>
          <Minus size={11} strokeWidth={3} />
        </button>
      </div>
      <button className="pipd-back" data-testid="pip-frame-back" aria-label="Back to tab" onClick={() => bridge.pipFrameAction('back')}>
        <CornerUpLeft size={12} strokeWidth={2.4} />
        Back to tab
      </button>

      <div className="pipd-center">
        {st.d > 0 && (
          <button className="pipd-skip" data-testid="pip-back10" aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => media({ cmd: 'skip', by: -10 })}>
            <RotateCcw size={17} strokeWidth={2} />
            <span>10</span>
          </button>
        )}
        <button className="pipd-play" data-testid="pip-play" aria-label={playLabel} title={playLabel} onClick={() => media({ cmd: 'toggle' })}>
          <PlayIcon size={20} fill="currentColor" strokeWidth={0} />
        </button>
        {st.d > 0 && (
          <button className="pipd-skip" data-testid="pip-fwd10" aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => media({ cmd: 'skip', by: 10 })}>
            <RotateCw size={17} strokeWidth={2} />
            <span>10</span>
          </button>
        )}
      </div>

      <div className="pipd-bottom">
        <span data-testid="pip-time">{formatTime(time)}</span>
        {st.d > 0 ? (
          <>
            <Seek t={time} d={st.d} pct={Math.min(100, (time / st.d) * 100)} onScrub={setScrub} onSeek={(t) => media({ cmd: 'seek', t })} />
            <span>{formatTime(st.d)}</span>
          </>
        ) : (
          <span className="pipd-live">Live</span>
        )}
      </div>

      {/* Drag an edge or corner to resize (Chromium's own window doesn't take the mouse). */}
      {RESIZE_EDGES.map((edge) => (
        <div key={edge} className="pipd-edge" data-edge={edge} data-testid={`pip-edge-${edge}`} onPointerDown={(e) => beginDrag(e, edge)} />
      ))}
    </div>
  );
}

/** The slider: drag (or click) to jump to any moment — e.g. back to where you were. */
function Seek({ t, d, pct, onScrub, onSeek }: { t: number; d: number; pct: number; onScrub: (t: number | null) => void; onSeek: (t: number) => void }) {
  const lastSent = useRef(0);
  const dragging = useRef(false);
  const end = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    onSeek(Number(e.currentTarget.value));
    onScrub(null);
  };
  return (
    <div className="pipd-seek">
      <div className="pipd-track">
        <div className="pipd-fill" style={{ width: `${Math.max(0, pct)}%` }} />
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
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
        }}
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

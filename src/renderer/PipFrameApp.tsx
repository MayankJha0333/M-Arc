// The frame Kite lays over the floating video: a soft border, and on hover a small
// pill with Back to tab / Minimize / Close. The window lets clicks through to the
// video everywhere except on these buttons.

import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Maximize2, Minimize2, X } from 'lucide-react';
import { bridge } from './platform';

const HIDE_AFTER_MS = 1800;

export function PipFrameApp() {
  const [compact, setCompact] = useState(false);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overButton = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add('pip-frame-doc');
    const off = bridge.onPipFrameState((v) => setCompact(v.compact));
    // Mouse moves reach this see-through window even while clicks pass through to the video.
    const wake = () => {
      setShown(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => !overButton.current && setShown(false), HIDE_AFTER_MS);
    };
    document.addEventListener('mousemove', wake);
    return () => {
      off();
      document.removeEventListener('mousemove', wake);
    };
  }, []);

  const hover = (over: boolean) => {
    overButton.current = over;
    bridge.pipFrameHover(over);
  };

  const Btn = ({ action, label, children }: { action: 'back' | 'minimize' | 'close'; label: string; children: React.ReactNode }) => (
    <button
      className="pip-frame-btn"
      data-testid={`pip-frame-${action}`}
      data-action={action}
      aria-label={label}
      title={label}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
      onClick={() => {
        hover(false);
        bridge.pipFrameAction(action);
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="pip-frame" data-testid="pip-frame" data-shown={shown || undefined} data-compact={compact || undefined}>
      <div className="pip-frame-border" />
      <div className="pip-frame-bar" role="toolbar" aria-label="Floating video">
        <Btn action="back" label="Back to tab">
          <CornerUpLeft size={14} />
        </Btn>
        <Btn action="minimize" label={compact ? 'Restore size' : 'Minimize'}>
          {compact ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
        </Btn>
        <Btn action="close" label="Close">
          <X size={14} />
        </Btn>
      </div>
    </div>
  );
}

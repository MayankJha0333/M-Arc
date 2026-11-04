import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import * as ops from '@shared/ops';
import { getS, setUi, useKite } from '../store';
import { surface } from '../surfaces';

/** Find-in-page bar (⌘F). */
export function FindBar() {
  const open = useKite((st) => st.ui.findOpen);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  const h = () => surface(ops.activeTab(getS())?.id);
  const close = () => {
    h()?.stopFind();
    setUi({ findOpen: false });
  };
  return (
    <div className="find-bar" data-testid="find-bar">
      <input
        ref={ref}
        value={q}
        placeholder="Find in page"
        data-testid="find-input"
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value) h()?.find(e.target.value);
          else h()?.stopFind();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') h()?.find(q, !e.shiftKey);
          if (e.key === 'Escape') close();
        }}
      />
      <button className="icon-btn" aria-label="Previous match" onClick={() => h()?.find(q, false)}><ChevronUp size={14} /></button>
      <button className="icon-btn" aria-label="Next match" onClick={() => h()?.find(q, true)}><ChevronDown size={14} /></button>
      <button className="icon-btn" aria-label="Close find" onClick={close}><X size={14} /></button>
    </div>
  );
}

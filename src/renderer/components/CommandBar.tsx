import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { setUi, useKite } from '../store';
import { openUrl } from '../commands';

/** Basic command bar: type a URL or search and press Enter. */
export function CommandBar() {
  const cb = useKite((st) => st.ui.commandBar);
  if (!cb) return null;
  return <CommandBarInner key={`${cb.mode}:${cb.initial}`} mode={cb.mode} initial={cb.initial} />;
}

function CommandBarInner({ mode, initial }: { mode: 'new' | 'edit'; initial: string }) {
  const [q, setQ] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const close = () => setUi({ commandBar: null });
  return (
    <div className="cb-scrim" data-testid="command-bar" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cb" role="dialog" aria-label="Command bar">
        <div className="cb-input-row">
          <Search size={18} className="cb-icon" />
          <input
            ref={ref}
            className="cb-input"
            data-testid="cb-input"
            value={q}
            placeholder="Search or enter address"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'Enter' && q.trim()) {
                close();
                openUrl(q, mode === 'edit' ? 'current' : 'new');
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

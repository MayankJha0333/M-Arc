import { useEffect } from 'react';
import { X } from 'lucide-react';
import { setUi } from '../store';
import { playSound } from '../sound';

/** A centered panel used for Settings, Archive, Boosts, the Space editor… */
export function Sheet({ title, subtitle, children, onClose, testId, wide, footer }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; onClose?: () => void; testId?: string; wide?: boolean; footer?: React.ReactNode }) {
  const close = onClose ?? (() => setUi({ panel: null, panelArg: undefined }));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest?.('[data-recording="true"]')) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="sheet" data-wide={wide || undefined} role="dialog" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
        <header className="sheet-head">
          <div>
            <h2 className="sheet-title">{title}</h2>
            {subtitle && <p className="sheet-sub">{subtitle}</p>}
          </div>
          <button className="icon-btn" aria-label="Close" data-testid="sheet-close" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({ label, hint, children, inline }: { label: string; hint?: React.ReactNode; children: React.ReactNode; inline?: boolean }) {
  return (
    <label className="field" data-inline={inline || undefined}>
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, testId }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="segmented" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} data-on={value === o.value || undefined} data-testid={testId ? `${testId}-${o.value}` : undefined} onClick={(e) => { e.preventDefault(); onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, testId, label }: { checked: boolean; onChange: (v: boolean) => void; testId?: string; label?: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="toggle" data-on={checked || undefined} data-testid={testId} onClick={(e) => { e.preventDefault(); playSound('toggle'); onChange(!checked); }}>
      <span className="toggle-knob" />
    </button>
  );
}

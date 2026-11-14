import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { setUi, useKite } from '../store';
import { playSound } from '../sound';

/** A centered panel used for Settings, Archive, Boosts, the Space editor… */
/** Esc closes the panel, except while a shortcut is being recorded. */
function useEscToClose(close: () => void) {
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
}

const closePanel = () => setUi({ panel: null, panelArg: undefined });

/**
 * Close with a short exit animation (faster than the entrance, easing in), then
 * really close. If another panel took its place meanwhile, that one is left alone.
 */
function useLeave(close: () => void): [boolean, () => void] {
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const leave = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const { s, ui } = useKite.getState();
    const reduce = s.settings.reduceMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const ms = reduce ? 0 : Math.round(120 / (s.settings.motionSpeed || 1));
    if (!ms) return close();
    const panel = ui.panel;
    setLeaving(true);
    window.setTimeout(() => {
      if (useKite.getState().ui.panel === panel) close();
    }, ms);
  }, [close]);
  return [leaving, leave];
}

/**
 * A full page inside the page area (Settings): the sidebar stays usable beside it,
 * picking any tab goes back to it, and Esc or the close button returns to your page.
 */
export function Page({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  const [leaving, leave] = useLeave(closePanel);
  useEscToClose(leave);
  return (
    <section className="kite-page" role="region" aria-label={title} data-testid={testId} data-leaving={leaving || undefined}>
      <button className="icon-btn page-close" aria-label={`Close ${title}`} title={`Close ${title} (esc)`} data-testid="sheet-close" onClick={leave}>
        <X size={16} />
      </button>
      {children}
    </section>
  );
}

export function Sheet({ title, subtitle, children, onClose, testId, wide, footer }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; onClose?: () => void; testId?: string; wide?: boolean; footer?: React.ReactNode }) {
  const [leaving, close] = useLeave(onClose ?? closePanel);
  useEscToClose(close);
  return (
    <div className="sheet-scrim" data-leaving={leaving || undefined} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="sheet" data-wide={wide || undefined} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
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

/** A titled card of settings rows. */
export function Group({ title, desc, children, testId }: { title?: React.ReactNode; desc?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="set-group" data-testid={testId}>
      {(title || desc) && (
        <header className="set-group-head">
          {title && <h3 className="set-group-title">{title}</h3>}
          {desc && <p className="set-group-desc">{desc}</p>}
        </header>
      )}
      <div className="set-card">{children}</div>
    </section>
  );
}

/** One setting: what it is on the left, its control on the right (or below, with `stack`). */
export function Row({ title, desc, value, children, stack, off }: { title: React.ReactNode; desc?: React.ReactNode; value?: React.ReactNode; children: React.ReactNode; stack?: boolean; off?: boolean }) {
  return (
    <div className="set-row" data-stack={stack || undefined} data-off={off || undefined}>
      <span className="set-row-text">
        <span className="set-row-title">
          {title}
          {value !== undefined && <span className="set-row-value">{value}</span>}
        </span>
        {desc && <span className="set-row-desc">{desc}</span>}
      </span>
      <span className="set-row-control">{children}</span>
    </div>
  );
}

/** An on/off setting. The whole row is clickable. */
export function SwitchRow({ title, desc, checked, onChange, testId, label, off, sub }: { title: React.ReactNode; desc?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; testId?: string; label?: string; off?: boolean; sub?: boolean }) {
  return (
    <label className="set-row set-switch" data-off={off || undefined} data-sub={sub || undefined}>
      <span className="set-row-text">
        <span className="set-row-title">{title}</span>
        {desc && <span className="set-row-desc">{desc}</span>}
      </span>
      <Toggle checked={checked} onChange={onChange} testId={testId} label={label ?? (typeof title === 'string' ? title : undefined)} />
    </label>
  );
}

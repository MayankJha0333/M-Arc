import { useKite, setUi } from '../store';

export function Toasts() {
  const toasts = useKite((st) => st.ui.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-testid="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!();
                setUi((u) => ({ toasts: u.toasts.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

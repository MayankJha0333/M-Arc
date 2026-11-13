import { ShieldAlert, WifiOff, RotateCw } from 'lucide-react';
import type { ID } from '@shared/types';
import { loadErrorText } from '@shared/shields';
import { hostOf } from '@shared/url';
import { bridge } from '../platform';
import { surface } from '../surfaces';
import { useKite } from '../store';

/** Shown over a page that failed to load: what went wrong, in plain words, and what you can do. */
export function LoadError({ id, error }: { id: ID; error: { code: number; desc: string; url: string } }) {
  const httpsOnly = useKite((st) => st.s.settings.httpsOnly);
  const t = loadErrorText(error.code, error.desc);
  const host = hostOf(error.url);
  // A site that only speaks http fails under HTTPS-only: offer the way through, clearly labelled.
  const canHttp = httpsOnly && !t.cert && /^https:/i.test(error.url) && [-100, -101, -102, -107, -110, -113, -118, -7].includes(error.code);
  return (
    <div className="load-error" data-testid="load-error" data-cert={t.cert || undefined} role="alert">
      <span className="load-error-icon">{t.cert ? <ShieldAlert size={30} /> : <WifiOff size={30} />}</span>
      <h2>{t.title}</h2>
      <p>{t.detail}</p>
      <p className="load-error-url">{error.url.slice(0, 200)}</p>
      <div className="load-error-actions">
        <button className="btn primary" data-testid="load-error-retry" onClick={() => surface(id)?.load(error.url)}>
          <RotateCw size={14} /> Try again
        </button>
        {canHttp && (
          <button
            className="btn"
            data-testid="load-error-http"
            onClick={() => {
              try {
                const u = new URL(error.url);
                bridge.allowHttp(u.hostname);
                u.protocol = 'http:';
                surface(id)?.load(u.href);
              } catch {
                /* not an address */
              }
            }}
          >
            Open {host} without encryption
          </button>
        )}
      </div>
      {t.cert && <p className="muted load-error-note">Kite never lets you skip this warning: a bad certificate is how impostor sites get caught.</p>}
    </div>
  );
}

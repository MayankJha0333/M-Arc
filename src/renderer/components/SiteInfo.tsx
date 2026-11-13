// The "about this site" popover under the address bar: is the connection secure,
// what Shields blocked, what the site may use, and clearing its data.

import { useEffect, useState } from 'react';
import { Lock, LockOpen, ShieldAlert, ShieldCheck, ShieldOff, Globe, Trash2, Laptop } from 'lucide-react';
import * as ops from '@shared/ops';
import { SECURITY_TEXT, isAllowedSite, securityLevel, shieldsActive, siteKey, type SecurityLevel } from '@shared/shields';
import type { SitePermission } from '@shared/ipc';
import { bridge } from '../platform';
import { setUi, toast, useKite } from '../store';
import { setShieldsForSite } from '../browserRuntime';
import { surface } from '../surfaces';
import { Toggle } from './Sheet';

export function SecurityIcon({ level, size = 12 }: { level: SecurityLevel; size?: number }) {
  if (level === 'secure') return <Lock size={size} className="url-lock" />;
  if (level === 'broken') return <ShieldAlert size={size} className="url-lock" />;
  if (level === 'insecure') return <LockOpen size={size} className="url-lock" />;
  if (level === 'local') return <Laptop size={size} className="url-lock" />;
  return <Globe size={size} className="url-lock" />;
}

/** What the address bar should say about the current tab. */
export function useSecurity(): { level: SecurityLevel; url: string; id: string | null } {
  const tab = useKite((st) => ops.activeTab(st.s));
  const err = useKite((st) => (tab ? st.ui.loadError[tab.id] : undefined));
  const cert = !!err && err.code <= -200 && err.code >= -299;
  return { level: tab ? securityLevel(tab.url, cert) : 'internal', url: tab?.url ?? '', id: tab?.id ?? null };
}

export function SiteInfo() {
  const open = useKite((st) => st.ui.siteInfo);
  const { level, url, id } = useSecurity();
  const shields = useKite((st) => st.s.settings.shields);
  const blocked = useKite((st) => (id ? st.ui.blocked[id] ?? 0 : 0));
  const [perms, setPerms] = useState<SitePermission[]>([]);
  const site = siteKey(url);

  useEffect(() => {
    if (!open) return;
    void bridge.permissions().then(setPerms);
    const off = bridge.onPermissions(setPerms);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ siteInfo: false });
    window.addEventListener('keydown', key);
    return () => {
      off();
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!open || !id) return null;
  const text = SECURITY_TEXT[level];
  const mine = perms.filter((p) => p.site === site || p.site === `www.${site}`);
  const on = shieldsActive(shields, url);
  const web = /^https?:/i.test(url);
  return (
    <>
      <div className="site-info-catcher" onMouseDown={() => setUi({ siteInfo: false })} />
      <div className="site-info" role="dialog" aria-label="About this site" data-testid="site-info" data-level={level}>
        <div className="site-info-head">
          <span className="site-info-badge"><SecurityIcon level={level} size={16} /></span>
          <div>
            <b data-testid="site-info-title">{text.title}</b>
            <span className="muted">{site || 'This page'}</span>
          </div>
        </div>
        <p className="muted">{text.detail}</p>

        {web && (
          <div className="site-info-row">
            {on ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
            <div>
              <b>Shields</b>
              <span className="muted" data-testid="site-info-blocked">
                {!shields.enabled ? 'Turned off in Settings' : isAllowedSite(shields, url) ? 'Off for this site' : `${blocked} ad${blocked === 1 ? '' : 's'} and tracker${blocked === 1 ? '' : 's'} blocked on this page`}
              </span>
            </div>
            <Toggle checked={on} onChange={(v) => shields.enabled && setShieldsForSite(url, v)} testId="site-info-shields" label="Shields on this site" />
          </div>
        )}

        {mine.length > 0 && (
          <div className="site-info-perms">
            <span className="look-h">This site may</span>
            {mine.map((p) => (
              <div className="site-info-perm" key={p.permission} data-testid={`site-perm-${p.permission}`}>
                <span>{p.allowed ? 'Always' : 'Never'} {p.label}</span>
                <button className="btn small ghost" onClick={() => bridge.forgetPermission(p.site, p.permission)}>Ask again</button>
              </div>
            ))}
          </div>
        )}

        {web && (
          <button
            className="btn small"
            data-testid="site-info-clear"
            onClick={async () => {
              await bridge.clearData({ cookies: true, storage: true, cache: false }, site);
              setUi({ siteInfo: false });
              surface(id)?.reload();
              toast(`Cookies and saved data for ${site} erased`);
            }}
          >
            <Trash2 size={13} /> Erase this site’s cookies and data
          </button>
        )}
        <button className="btn small ghost" data-testid="site-info-settings" onClick={() => setUi({ siteInfo: false, panel: 'settings', panelArg: 'privacy' })}>
          Privacy & security settings
        </button>
      </div>
    </>
  );
}

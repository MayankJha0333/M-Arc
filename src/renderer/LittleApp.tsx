// The little window: one page, minimal chrome, quick to open and dismiss.
// It reads saved state (Spaces, theme, search engine) but never writes it —
// the main window owns the saved state.

import { useEffect, useMemo, useState } from 'react';
import { findAction } from '@shared/shortcuts';
import { ArrowLeft, ArrowRight, RotateCw, ChevronDown, Search, Maximize2 } from 'lucide-react';
import { loadState } from '@shared/persistence';
import { normalizeInput, displayUrl } from '@shared/url';
import { activeSpace } from '@shared/tree';
import type { AppState } from '@shared/types';
import { bridge, isElectron, isMac } from './platform';
import { themeVars, resolveDark } from './theme';
import { useSystemDark } from './App';
import { WebSurface } from './components/WebSurface';
import { surface } from './surfaces';
import { linkCatcherScript } from '@shared/links';
import { KiteLogo } from './components/KiteLogo';
import { SiteIcon } from './components/SiteIcon';
import { applyBoostsWith } from './boostRuntime';

const ID = 'little';

export function LittleApp() {
  const [state, setState] = useState<AppState | null>(null);
  const params = new URLSearchParams(location.search);
  const start = params.get('url') || 'kite://new';
  const [url, setUrl] = useState(start === 'kite://new' ? '' : start);
  const [title, setTitle] = useState('');
  const [nav, setNav] = useState({ back: false, forward: false });
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(start === 'kite://new');
  const systemDark = useSystemDark();

  useEffect(() => {
    void bridge.loadState().then((raw) => setState(loadState(raw)));
  }, []);

  // A few shortcuts make sense here too (they arrive from the page via the main process, or from this window).
  useEffect(() => {
    const run = (a: string) => {
      if (a === 'closeTab') window.close();
      else if (a === 'commandBar' || a === 'editUrl') setEditing(true);
      else if (a === 'reload') surface(ID)?.reload();
      else if (a === 'back') surface(ID)?.back();
      else if (a === 'forward') surface(ID)?.forward();
    };
    const off = bridge.onShortcut(run);
    const key = (e: KeyboardEvent) => {
      if (!state) return;
      const a = findAction(e, state.settings.shortcuts, isMac);
      if (a && ['closeTab', 'commandBar', 'editUrl', 'reload', 'back', 'forward'].includes(a)) {
        e.preventDefault();
        run(a);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      off();
      window.removeEventListener('keydown', key, true);
    };
  }, [state]);

  // Little windows archive themselves after sitting unused (Settings → Little window).
  useEffect(() => {
    if (!state) return;
    const after = state.settings.littleArchiveAfterMs;
    if (after === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const blur = () => {
      timer = setTimeout(() => {
        if (url) bridge.archiveFromLittle(url, title || url);
        window.close();
      }, after);
    };
    const focus = () => timer && clearTimeout(timer);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      if (timer) clearTimeout(timer);
    };
  }, [state, url, title]);

  const vars = useMemo(() => (state ? themeVars(activeSpace(state).theme, state.settings, systemDark) : {}), [state, systemDark]);
  if (!state) return <div className="boot" />;
  const dark = resolveDark(activeSpace(state).theme, systemDark);

  const go = (text: string) => {
    const u = normalizeInput(text, state.settings.searchEngine);
    if (!u) return;
    setEditing(false);
    if (url && surface(ID)) surface(ID)!.load(u);
    setUrl(u);
  };
  const openIn = (spaceId: string | null) => {
    setMenu(false);
    if (url) bridge.moveLittleToMain(url, spaceId);
  };

  return (
    <div className="app little-app" style={vars as React.CSSProperties} data-theme={dark ? 'dark' : 'light'} data-testid="little" data-electron={isElectron || undefined} data-mac={isMac || undefined}>
      <div className="grain" aria-hidden="true" />
      <header className="little-bar drag">
        <div className="little-bar-inner no-drag">
          <button className="icon-btn" aria-label="Back" disabled={!nav.back} onClick={() => surface(ID)?.back()}>
            <ArrowLeft size={15} />
          </button>
          <button className="icon-btn" aria-label="Forward" disabled={!nav.forward} onClick={() => surface(ID)?.forward()}>
            <ArrowRight size={15} />
          </button>
          <button className="icon-btn" aria-label="Reload" disabled={!url} onClick={() => surface(ID)?.reload()}>
            <RotateCw size={14} className={loading ? 'spin' : undefined} />
          </button>
          {editing ? (
            <form
              className="little-url editing"
              onSubmit={(e) => {
                e.preventDefault();
                go(new FormData(e.currentTarget).get('q') as string);
              }}
            >
              <Search size={13} />
              <input name="q" autoFocus defaultValue={url} placeholder="Search or enter address" data-testid="little-input" onKeyDown={(e) => e.key === 'Escape' && url && setEditing(false)} />
            </form>
          ) : (
            <button className="little-url" data-testid="little-url" onClick={() => setEditing(true)} title={url}>
              {url && <SiteIcon url={url} title={title} size={14} />}
              <span>{title || displayUrl(url)}</span>
            </button>
          )}
          <div className="little-open">
            <button className="btn small primary" disabled={!url} data-testid="little-open-main" onClick={() => openIn(null)} title="Move this page into Kite's main window">
              <Maximize2 size={13} /> Open in Kite
            </button>
            <button className="btn small primary little-open-more" disabled={!url} aria-label="Choose a Space" data-testid="little-open-menu" onClick={() => setMenu((m) => !m)}>
              <ChevronDown size={13} />
            </button>
            {menu && (
              <div className="menu little-menu" role="menu">
                {state.spaces.map((sp) => (
                  <button key={sp.id} role="menuitem" className="menu-item" data-testid={`little-space-${sp.name}`} onClick={() => openIn(sp.id)}>
                    <span>
                      {sp.icon} {sp.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="little-stage">
        <div className="card">
          {url ? (
            <div className="surface-slot" data-visible="true">
              <WebSurface
                id={ID}
                initialUrl={url}
                visible
                onNavigate={setUrl}
                onTitle={setTitle}
                onFavicon={() => undefined}
                onLoading={setLoading}
                onNav={(back, forward) => setNav({ back, forward })}
                onLink={(_d, u) => go(u)}
                onOpen={(u) => bridge.moveLittleToMain(u, null)}
                onReady={(handle, u) => {
                  handle.exec(linkCatcherScript({ pinnedHost: null, peekOnExternal: false, peekOnShift: false, isPeek: true, isMac })).catch(() => undefined);
                  void applyBoostsWith(state, handle, u);
                }}
              />
            </div>
          ) : (
            <div className="empty little-empty">
              <KiteLogo size={44} />
              <p>Quick look-up. Type above and press Enter.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

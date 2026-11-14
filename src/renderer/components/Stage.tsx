import { useEffect, useMemo, useRef } from 'react';
import type { ID, Item } from '@shared/types';
import * as ops from '@shared/ops';
import { act, setUi, useKite } from '../store';
import { openUrl } from '../commands';
import { now } from '../platform';
import { WebSurface } from './WebSurface';
import { setupPage, usePolicySync } from '../pageSetup';
import { FindBar } from './FindBar';
import { SplitChrome, splitRects, paneStyle } from './SplitView';
import { NoteEditor } from './NoteEditor';
import { Peek } from './Peek';
import { DropZone } from '../dnd';
import { partitionForTab } from '@shared/profiles';
import { LoadError } from './LoadError';
import { StartPage } from './StartPage';
import { isNewTabUrl } from '@shared/url';
import { SettingsPanel } from './Settings';
import { PanelGuard } from './Panels';

type Rect = { left: number; top: number; width: number; height: number };
const FULL: Rect = { left: 0, top: 0, width: 100, height: 100 };

export function Stage() {
  const activeId = useKite((st) => ops.activeItemId(st.s));
  const active = useKite((st) => (activeId ? st.s.items[activeId] : null));
  const loadedRaw = useKite((st) => st.ui.loaded);
  const items = useKite((st) => st.s.items);
  const loading = useKite((st) => {
    const t = ops.activeTab(st.s);
    return t ? !!st.ui.loading[t.id] : false;
  });
  const loaded = useMemo(() => loadedRaw.filter((id) => items[id]?.kind === 'tab'), [loadedRaw, items]);
  const settingsPage = useKite((st) => (st.ui.panel === 'settings' ? st.ui.panelArg ?? 'appearance' : st.ui.panel === 'shortcuts' ? 'keys' : null));
  // Going to another tab (or a new one) leaves Settings, like leaving a page. Switching
  // Space keeps it open, so each Space can be styled from Settings.
  const spaceId = useKite((st) => st.s.activeSpaceId);
  const last = useRef({ activeId, spaceId });
  useEffect(() => {
    const before = last.current;
    last.current = { activeId, spaceId };
    if (before.activeId === activeId || before.spaceId !== spaceId) return;
    const p = useKite.getState().ui.panel;
    if (p === 'settings' || p === 'shortcuts') setUi({ panel: null, panelArg: undefined });
  }, [activeId, spaceId]);

  const rects = useMemo<Record<ID, Rect>>(() => {
    if (!active) return {};
    if (active.kind === 'tab') return { [active.id]: FULL };
    if (active.kind === 'split') return splitRects(active);
    return {};
  }, [active]);

  // Pages that should be on screen must be mounted even if not yet in the loaded list.
  const mounted = useMemo(() => Array.from(new Set([...loaded, ...Object.keys(rects)])).filter((id) => items[id]?.kind === 'tab'), [loaded, rects, items]);

  return (
    <main className="stage" data-testid="stage">
      <DropZone zone={{ type: 'stage' }} className="card" testId="page-card" data-split={active?.kind === 'split' || undefined}>
        <div className="load-bar" data-on={loading || undefined} />
        {mounted.map((id) => (
          <SurfaceSlot key={id} id={id} rect={rects[id]} inSplit={active?.kind === 'split' && active.panes.includes(id)} focusedInSplit={active?.kind === 'split' && active.panes[active.focused] === id} />
        ))}
        {active?.kind === 'split' && <SplitChrome split={active} />}
        {active?.kind === 'note' && <NoteEditor key={active.id} note={active} />}
        {!active && <StartPage />}
        <FindBar />
        {settingsPage && (
          <PanelGuard key="settings">
            <SettingsPanel />
          </PanelGuard>
        )}
      </DropZone>
      <Peek />
    </main>
  );
}

function SurfaceSlot({ id, rect, focusedInSplit, inSplit }: { id: ID; rect?: Rect; focusedInSplit: boolean; inSplit: boolean }) {
  const item = useKite((st) => st.s.items[id]) as Extract<Item, { kind: 'tab' }>;
  usePolicySync(id, false);
  // A tab moved into (or out of) an isolated Space reloads with that Space's cookie jar.
  const partition = useKite((st) => partitionForTab(st.s, id));
  const error = useKite((st) => st.ui.loadError[id]);
  const visible = !!rect;
  const style = rect
    ? inSplit
      ? paneStyle(rect)
      : { left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }
    : undefined;
  return (
    <div className="surface-slot" data-visible={visible || undefined} data-focused={focusedInSplit || undefined} data-split={inSplit || undefined} style={style} data-testid={`slot-${id}`}>
      {isNewTabUrl(item.url) ? (
        visible && <StartPage tabId={id} />
      ) : (
      <WebSurface
        key={partition}
        partition={partition}
        id={id}
        initialUrl={item.url}
        visible={visible}
        onFail={(err) => setUi((u) => (u.loadError[id] === err || (!err && !u.loadError[id]) ? {} : { loadError: { ...u.loadError, [id]: err ?? undefined } }))}
        onNavigate={(url) => act((d) => ops.updateTab(d, id, { url }, now()))}
        onTitle={(title) => act((d) => ops.updateTab(d, id, { title }, now()))}
        onFavicon={(favicon) => act((d) => ops.updateTab(d, id, { favicon }, now()))}
        onLoading={(l) => setUi((u) => ({ loading: { ...u.loading, [id]: l } }))}
        onNav={(back, forward) => setUi((u) => ({ nav: { ...u.nav, [id]: { back, forward } } }))}
        onLink={(decision, url) => openUrl(url, decision, { sourceTabId: id })}
        onOpen={(url, background) => /^https?:\/\//i.test(url) && openUrl(url, background ? 'background' : 'new')}
        onReady={(handle, url) => {
          setupPage(id, handle, url, false);
          if (useKite.getState().ui.muted[id]) handle.setMuted(true);
        }}
        onMedia={(playing) => setUi((u) => ({ playing: { ...u.playing, [id]: playing } }))}
        onFocus={() => {
          const sp = ops.activeItemId(useKite.getState().s);
          const it = sp ? useKite.getState().s.items[sp] : null;
          if (it?.kind === 'split' && it.panes.includes(id) && it.panes[it.focused] !== id) act((d) => ops.select(d, id, now()));
        }}
      />
      )}
      {error && visible && <LoadError id={id} error={error} />}
    </div>
  );
}


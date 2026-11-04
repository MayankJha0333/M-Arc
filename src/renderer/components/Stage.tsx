import { useMemo } from 'react';
import type { ID, Item } from '@shared/types';
import * as ops from '@shared/ops';
import { formatShortcut } from '@shared/shortcuts';
import { act, setUi, useKite } from '../store';
import { actions, openUrl } from '../commands';
import { isMac, now } from '../platform';
import { WebSurface } from './WebSurface';
import { KiteLogo } from './KiteLogo';
import { setupPage } from '../pageSetup';
import { FindBar } from './FindBar';
import { SplitChrome, splitRects, paneStyle } from './SplitView';
import { NoteEditor } from './NoteEditor';
import { Peek } from './Peek';
import { DropZone } from '../dnd';

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
        {!active && <EmptyState />}
        <FindBar />
      </DropZone>
      <Peek />
    </main>
  );
}

function SurfaceSlot({ id, rect, focusedInSplit, inSplit }: { id: ID; rect?: Rect; focusedInSplit: boolean; inSplit: boolean }) {
  const item = useKite((st) => st.s.items[id]) as Extract<Item, { kind: 'tab' }>;
  const visible = !!rect;
  const style = rect
    ? inSplit
      ? paneStyle(rect)
      : { left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }
    : undefined;
  return (
    <div className="surface-slot" data-visible={visible || undefined} data-focused={focusedInSplit || undefined} data-split={inSplit || undefined} style={style} data-testid={`slot-${id}`}>
      <WebSurface
        id={id}
        initialUrl={item.url}
        visible={visible}
        onNavigate={(url) => act((d) => ops.updateTab(d, id, { url }, now()))}
        onTitle={(title) => act((d) => ops.updateTab(d, id, { title }, now()))}
        onFavicon={(favicon) => act((d) => ops.updateTab(d, id, { favicon }, now()))}
        onLoading={(l) => setUi((u) => ({ loading: { ...u.loading, [id]: l } }))}
        onNav={(back, forward) => setUi((u) => ({ nav: { ...u.nav, [id]: { back, forward } } }))}
        onLink={(decision, url) => openUrl(url, decision, { sourceTabId: id })}
        onOpen={(url, background) => openUrl(url, background ? 'background' : 'new')}
        onReady={(handle, url) => setupPage(id, handle, url, false)}
        onFocus={() => {
          const sp = ops.activeItemId(useKite.getState().s);
          const it = sp ? useKite.getState().s.items[sp] : null;
          if (it?.kind === 'split' && it.panes.includes(id) && it.panes[it.focused] !== id) act((d) => ops.select(d, id, now()));
        }}
      />
    </div>
  );
}

function EmptyState() {
  const sc = useKite((st) => st.s.settings.shortcuts);
  return (
    <div className="empty" data-testid="empty-state">
      <div className="empty-mark">
        <KiteLogo size={64} />
      </div>
      <h1 className="empty-title">Where to?</h1>
      <button className="empty-search" data-testid="empty-search" onClick={actions.commandBar}>
        Search or type a URL
        <kbd>{formatShortcut(sc.commandBar, isMac)}</kbd>
      </button>
      <div className="empty-hints">
        <span><kbd>{formatShortcut(sc.newNote, isMac)}</kbd> New note</span>
        <span><kbd>{formatShortcut(sc.toggleSidebar, isMac)}</kbd> Hide sidebar</span>
        <span><kbd>{formatShortcut(sc.settings, isMac)}</kbd> Settings</span>
      </div>
    </div>
  );
}

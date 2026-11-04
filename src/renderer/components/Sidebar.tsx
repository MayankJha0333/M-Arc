import { ArrowLeft, ArrowRight, RotateCw, PanelLeft, Plus, Lock, Search, Settings2, Archive, Sparkles, Wand2 } from 'lucide-react';
import { boostsFor } from '@shared/boosts';
import * as ops from '@shared/ops';
import { displayUrl } from '@shared/url';
import { activeSpace } from '@shared/tree';
import { act, setUi, useKite } from '../store';
import { actions } from '../commands';
import { isElectron, isMac } from '../platform';
import { ItemRow } from './ItemRow';
import { Favorites } from './Favorites';
import { SpaceBar, SpaceHeader, useSpaceSwipe } from './Spaces';
import { useRef } from 'react';
import { formatShortcut } from '@shared/shortcuts';
import { openMenu } from './ContextMenu';
import { DropZone } from '../dnd';

export function Sidebar() {
  const side = useKite((st) => st.s.settings.sidebarSide);
  const showUrl = useKite((st) => st.s.settings.showUrlBar);
  const space = useKite((st) => activeSpace(st.s));
  const shortcuts = useKite((st) => st.s.settings.shortcuts);
  const width = useKite((st) => st.s.settings.sidebarWidth);
  const needsLightsGap = isElectron && isMac && side === 'left';
  const onWheel = useSpaceSwipe();
  const spaceIndex = useKite((st) => st.s.spaces.findIndex((x) => x.id === st.s.activeSpaceId));
  const lastIndex = useRef(spaceIndex);
  const dir = spaceIndex === lastIndex.current ? 'none' : spaceIndex > lastIndex.current ? 'next' : 'prev';
  lastIndex.current = spaceIndex;

  return (
    <aside className="sidebar" data-testid="sidebar" aria-label="Sidebar" style={{ width }}>
      <div className="sb-top drag" data-lights={needsLightsGap || undefined}>
        <div className="sb-top-btns no-drag">
          <IconBtn label="Toggle sidebar" testId="btn-toggle-sidebar" onClick={actions.toggleSidebar}>
            <PanelLeft size={16} />
          </IconBtn>
          <NavButtons />
        </div>
      </div>

      {showUrl && <UrlPill />}

      <div className="sb-scroll" data-testid="sb-scroll" onWheel={onWheel}>
        <Favorites />
        <div className="space-pane" key={space.id} data-dir={dir}>
        <SpaceHeader space={space} />

        <section className="sb-section" aria-label="Pinned" data-testid="pinned-list" role="tree">
          {space.pinned.map((id) => (
            <ItemRow key={id} id={id} list="pinned" depth={0} />
          ))}
          <DropZone zone={{ type: 'end', list: 'pinned', spaceId: space.id }} className="list-end" testId="pinned-end">
            {space.pinned.length === 0 && <span className="hint">Drag tabs here to pin them</span>}
          </DropZone>
        </section>

        <div className="sb-divider">
          <span className="sb-divider-line" />
          {space.today.length > 0 && (
            <button className="sb-clear" data-testid="btn-clear-today" onClick={() => actions.clearToday?.()} title="Archive all unpinned tabs">
              <Sparkles size={12} /> Clear
            </button>
          )}
        </div>

        <button className="row new-tab" data-testid="btn-new-tab" onClick={actions.commandBar}>
          <Plus size={15} className="row-glyph" />
          <span className="row-title">New Tab</span>
          <kbd>{formatShortcut(shortcuts.commandBar, isMac)}</kbd>
        </button>

        <section className="sb-section" aria-label="Today" data-testid="today-list" role="tree">
          {space.today.map((id) => (
            <ItemRow key={id} id={id} list="today" depth={0} />
          ))}
          <DropZone zone={{ type: 'end', list: 'today', spaceId: space.id }} className="list-end grow" testId="today-end" />
        </section>
        </div>
      </div>

      <footer className="sb-footer">
        <IconBtn label="Archive" testId="btn-archive" onClick={() => actions.archivePage?.()}>
          <Archive size={16} />
        </IconBtn>
        <SpaceBar />
        <IconBtn label="Settings" testId="btn-settings" onClick={actions.settings}>
          <Settings2 size={16} />
        </IconBtn>
      </footer>
      <SidebarResizer />
    </aside>
  );
}

function NavButtons() {
  const tab = useKite((st) => ops.activeTab(st.s));
  const nav = useKite((st) => (tab ? st.ui.nav[tab.id] : undefined));
  return (
    <>
      <IconBtn label="Back" testId="btn-back" disabled={!nav?.back} onClick={actions.back}>
        <ArrowLeft size={16} />
      </IconBtn>
      <IconBtn label="Forward" testId="btn-forward" disabled={!nav?.forward} onClick={actions.forward}>
        <ArrowRight size={16} />
      </IconBtn>
      <IconBtn label="Reload" testId="btn-reload" disabled={!tab} onClick={actions.reload}>
        <RotateCw size={15} />
      </IconBtn>
    </>
  );
}

function UrlPill() {
  const tab = useKite((st) => ops.activeTab(st.s));
  const boosted = useKite((st) => (tab ? boostsFor(st.s, tab.url).length > 0 : false));
  const secure = tab?.url.startsWith('https:');
  return (
    <button
      className="url-pill"
      data-testid="url-pill"
      onClick={actions.editUrl}
      onContextMenu={(e) => tab && openMenu(e, [{ label: 'Copy URL', onSelect: actions.copyUrl }])}
      title={tab?.url ?? 'Search or enter address'}
    >
      {tab ? secure ? <Lock size={12} className="url-lock" /> : <Search size={12} className="url-lock" /> : <Search size={12} className="url-lock" />}
      <span className="url-text">{tab ? displayUrl(tab.url) : 'Search or enter address'}</span>
      {boosted && (
        <span
          className="url-boost"
          role="button"
          title="A Boost is changing this site"
          data-testid="url-boost"
          onClick={(e) => {
            e.stopPropagation();
            actions.boostEditor();
          }}
        >
          <Wand2 size={12} />
        </span>
      )}
    </button>
  );
}

export function IconBtn({ label, onClick, children, testId, disabled, active }: { label: string; onClick?: () => void; children: React.ReactNode; testId?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} data-testid={testId} disabled={disabled} data-active={active || undefined} onClick={onClick}>
      {children}
    </button>
  );
}

/** Drag the sidebar's edge to resize it. */
function SidebarResizer() {
  const side = useKite((st) => st.s.settings.sidebarSide);
  return (
    <div
      className="sb-resizer"
      data-testid="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = useKite.getState().s.settings.sidebarWidth;
        document.body.classList.add('resizing');
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - startX) * (side === 'left' ? 1 : -1);
          const w = Math.round(Math.max(200, Math.min(440, startW + dx)));
          act((d) => void (d.settings.sidebarWidth = w));
        };
        const up = () => {
          document.body.classList.remove('resizing');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onDoubleClick={() => act((d) => void (d.settings.sidebarWidth = 264))}
    />
  );
}

export { setUi };

import { memo, useEffect, useRef, useState } from 'react';
import { X, Undo2, Loader2, StickyNote, Columns2, Folder, FolderOpen } from 'lucide-react';
import type { ID, Item, ListName } from '@shared/types';
import { displayTitle } from '@shared/ops';
import { act, setUi, useKite } from '../store';
import { closeItemCmd, selectItem, navigateTab } from '../commands';
import { SiteIcon } from './SiteIcon';
import { openMenu } from './ContextMenu';
import { itemMenu } from '../itemMenus';
import * as ops from '@shared/ops';
import { hostOf } from '@shared/url';
import { useDragRow } from '../dnd';
import { splitTitle } from './SplitView';

interface Props {
  id: ID;
  list: ListName;
  depth: number;
}

export const ItemRow = memo(function ItemRow({ id, list, depth }: Props) {
  const item = useKite((st) => st.s.items[id]);
  const active = useKite((st) => st.s.activeBySpace[st.s.activeSpaceId] === id);
  const loading = useKite((st) => !!st.ui.loading[id]);
  const renaming = useKite((st) => st.ui.renaming === id);
  const closeOnHover = useKite((st) => st.s.settings.showTabCloseOnHover);
  const drag = useDragRow(id, item?.kind === 'folder');
  const liveTitle = useKite((st) => {
    const it = st.s.items[id];
    return !it ? '' : it.kind === 'split' ? splitTitle(it, st.s.items) : displayTitle(it);
  });
  if (!item) return null;
  const title = liveTitle;

  if (item.kind === 'folder') return <FolderRow item={item} depth={depth} renaming={renaming} drag={drag} />;

  const awayFromHome = item.kind === 'tab' && item.homeUrl && hostOf(item.homeUrl) !== '' && item.url !== item.homeUrl;

  return (
    <div
      ref={drag.setRef}
      {...drag.handlers}
      className="row"
      role="treeitem"
      aria-selected={active}
      data-active={active || undefined}
      data-kind={item.kind}
      data-drop={drag.dropHint ?? undefined}
      data-testid={`row-${id}`}
      data-title={title}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => selectItem(id)}
      onAuxClick={(e) => e.button === 1 && closeItemCmd(id)}
      onDoubleClick={() => setUi({ renaming: id })}
      onContextMenu={(e) => openMenu(e, itemMenu(id))}
      title={item.kind === 'tab' ? `${title}\n${item.url}` : title}
    >
      <RowIcon item={item} />
      {renaming ? (
        <RenameInput id={id} initial={title} />
      ) : (
        <span className="row-title">
          {awayFromHome && <span className="row-home-sep">{title}</span>}
          {!awayFromHome && title}
        </span>
      )}
      {loading && <Loader2 size={13} className="spin row-status" aria-label="Loading" />}
      {awayFromHome && (
        <button
          className="row-btn"
          title="Back to pinned page"
          data-testid={`home-${id}`}
          onClick={(e) => {
            e.stopPropagation();
            if (item.kind === 'tab' && item.homeUrl) navigateTab(id, item.homeUrl);
          }}
        >
          <Undo2 size={13} />
        </button>
      )}
      {(closeOnHover || active) && list !== 'favorites' && (
        <button
          className="row-btn row-close"
          aria-label="Close"
          data-testid={`close-${id}`}
          onClick={(e) => {
            e.stopPropagation();
            closeItemCmd(id);
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
});

function RowIcon({ item }: { item: Item }) {
  const items = useKite((st) => st.s.items);
  if (item.kind === 'tab') return <SiteIcon url={item.url} favicon={item.favicon} title={item.title} />;
  if (item.kind === 'note') return <StickyNote size={15} className="row-glyph" />;
  if (item.kind === 'split') {
    return (
      <span className="split-icons">
        <Columns2 size={14} className="row-glyph" />
        {item.panes.slice(0, 2).map((p) => {
          const t = items[p];
          return t?.kind === 'tab' ? <SiteIcon key={p} url={t.url} favicon={t.favicon} title={t.title} size={12} /> : null;
        })}
      </span>
    );
  }
  return null;
}

function FolderRow({ item, depth, renaming, drag }: { item: Extract<Item, { kind: 'folder' }>; depth: number; renaming: boolean; drag: ReturnType<typeof useDragRow> }) {
  const Icon = item.collapsed ? Folder : FolderOpen;
  return (
    <div className="folder" data-testid={`folder-${item.id}`} data-collapsed={item.collapsed || undefined}>
      <div
        ref={drag.setRef}
        {...drag.handlers}
        className="row folder-row"
        role="treeitem"
        aria-expanded={!item.collapsed}
        data-drop={drag.dropHint ?? undefined}
        data-testid={`row-${item.id}`}
        data-title={item.title}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => act((d) => ops.toggleFolder(d, item.id))}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setUi({ renaming: item.id });
        }}
        onContextMenu={(e) => openMenu(e, itemMenu(item.id))}
      >
        <Icon size={15} className="row-glyph" />
        {renaming ? <RenameInput id={item.id} initial={item.title} /> : <span className="row-title">{item.title}</span>}
        <span className="row-count">{item.children.length || ''}</span>
      </div>
      {!item.collapsed && (
        <div className="folder-children" role="group">
          {item.children.length === 0 && (
            <div className="folder-empty" style={{ paddingLeft: 30 + depth * 14 }}>
              Drop tabs here
            </div>
          )}
          {item.children.map((c) => (
            <ItemRow key={c} id={c} list="pinned" depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function RenameInput({ id, initial }: { id: ID; initial: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (save: boolean) => {
    if (save) act((d) => ops.renameItem(d, id, v));
    setUi({ renaming: null });
  };
  return (
    <input
      ref={ref}
      className="rename"
      data-testid="rename-input"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
      onBlur={() => done(true)}
    />
  );
}

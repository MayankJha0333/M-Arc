import { useKite } from '../store';
import { selectItem } from '../commands';
import { SiteIcon } from './SiteIcon';
import { openMenu } from './ContextMenu';
import { itemMenu } from '../itemMenus';
import { displayTitle } from '@shared/ops';
import { DropZone, useDragRow } from '../dnd';
import type { ID } from '@shared/types';

/** The icon grid at the top of the sidebar. Shared by every Space. */
export function Favorites() {
  const favs = useKite((st) => st.s.favorites);
  const cols = useKite((st) => st.s.settings.favoritesColumns);
  return (
    <DropZone zone={{ type: 'end', list: 'favorites', spaceId: null }} className="favorites-zone" testId="favorites" data-empty={favs.length === 0 || undefined}>
      {favs.length > 0 ? (
        <div className="favorites" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="list">
          {favs.map((id) => (
            <FavTile key={id} id={id} />
          ))}
        </div>
      ) : (
        // Takes no room until you drag a tab, then opens up as a drop target.
        <div className="favorites-empty">Drop here to add to Favorites</div>
      )}
    </DropZone>
  );
}

function FavTile({ id }: { id: ID }) {
  const it = useKite((st) => st.s.items[id]);
  const active = useKite((st) => st.s.activeBySpace[st.s.activeSpaceId] === id);
  const loaded = useKite((st) => st.ui.loaded.includes(id));
  const drag = useDragRow(id, false, 'x');
  if (!it || it.kind !== 'tab') return null;
  return (
    <button
      ref={drag.setRef as never}
      {...drag.handlers}
      className="fav"
      role="listitem"
      data-active={active || undefined}
      data-loaded={loaded || undefined}
      data-drop={drag.dropHint ?? undefined}
      data-testid={`fav-${id}`}
      title={displayTitle(it)}
      aria-label={displayTitle(it)}
      onClick={() => selectItem(id)}
      onContextMenu={(e) => openMenu(e, itemMenu(id))}
    >
      <SiteIcon url={it.url} favicon={it.favicon} title={it.title} size={20} />
    </button>
  );
}

import type { Space } from '@shared/types';
import { MoreHorizontal } from 'lucide-react';
import { useKite } from '../store';
import { actions } from '../commands';
import { openMenu } from './ContextMenu';

export function SpaceHeader({ space }: { space: Space }) {
  return (
    <div className="space-header" data-testid="space-header">
      <span className="space-icon">{space.icon}</span>
      <span className="space-name" data-testid="space-name">{space.name}</span>
      <button className="icon-btn space-more" aria-label="Space menu" data-testid="space-menu" onClick={(e) => openMenu(e, spaceMenu())}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

export function SpaceBar() {
  const spaces = useKite((st) => st.s.spaces);
  const activeId = useKite((st) => st.s.activeSpaceId);
  return (
    <div className="space-bar" role="tablist" aria-label="Spaces">
      {spaces.map((sp) => (
        <button key={sp.id} role="tab" aria-selected={sp.id === activeId} className="space-dot" data-active={sp.id === activeId || undefined} title={sp.name}>
          {sp.icon}
        </button>
      ))}
    </div>
  );
}

function spaceMenu() {
  return [
    { label: 'New Folder', testId: 'menu-new-folder', onSelect: actions.newFolder },
    { label: 'Collapse All Folders', testId: 'menu-collapse-all', onSelect: actions.collapseFolders },
    { label: 'Expand All Folders', testId: 'menu-expand-all', onSelect: actions.expandFolders },
  ];
}

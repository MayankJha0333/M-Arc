import type { Space } from '@shared/types';
import { useKite } from '../store';

export function SpaceHeader({ space }: { space: Space }) {
  return (
    <div className="space-header" data-testid="space-header">
      <span className="space-icon">{space.icon}</span>
      <span className="space-name" data-testid="space-name">{space.name}</span>
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

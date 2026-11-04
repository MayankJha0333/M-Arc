// Drag and drop for sidebar rows. (Filled in by the folders step.)
import type { ID } from '@shared/types';

export function useDragRow(_id: ID, _isFolder: boolean) {
  return { setRef: (_el: HTMLElement | null) => undefined, handlers: {}, dropHint: null as null | 'before' | 'after' | 'into' };
}

export type Zone =
  | { type: 'end'; list: 'pinned' | 'today' | 'favorites'; spaceId: ID | null }
  | { type: 'space'; spaceId: ID }
  | { type: 'stage' };

export function DropZone({ children, className, testId }: { zone: Zone; children?: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={className} data-testid={testId}>
      {children}
    </div>
  );
}

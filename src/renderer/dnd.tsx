// Drag and drop for the sidebar: reorder, pin/unpin, drop into folders,
// onto Favorites, onto another Space, or onto the page to make a split view.

import { create } from 'zustand';
import { useRef } from 'react';
import type { ID } from '@shared/types';
import type { DropTarget } from '@shared/folders';
import { dropItem } from '@shared/folders';
import { displayTitle } from '@shared/ops';
import { act, getS } from './store';

export type Zone = Extract<DropTarget, { type: 'end' } | { type: 'space' }> | { type: 'stage' };
export type Target = DropTarget | { type: 'stage' };

interface DndState {
  dragging: ID | null;
  target: Target | null;
}

export const useDnd = create<DndState>(() => ({ dragging: null, target: null }));

/** Handlers for when something is dropped on the page area (split view). */
let stageDropHandler: ((id: ID) => void) | null = null;
export function onStageDrop(fn: (id: ID) => void) {
  stageDropHandler = fn;
}

const THRESHOLD = 5;
let suppressClick = false;

function zoneKey(t: Target | null): string | null {
  if (!t) return null;
  if (t.type === 'end') return `end:${t.list}:${t.spaceId ?? ''}`;
  if (t.type === 'space') return `space:${t.spaceId}`;
  if (t.type === 'stage') return 'stage';
  return null;
}

function targetAt(x: number, y: number, dragId: ID): Target | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const row = el.closest('[data-dnd-row]') as HTMLElement | null;
  if (row) {
    const id = row.dataset.dndRow!;
    if (id === dragId) return null;
    const r = row.getBoundingClientRect();
    const horizontal = row.dataset.dndAxis === 'x';
    const ratio = horizontal ? (x - r.left) / r.width : (y - r.top) / r.height;
    if (row.dataset.dndFolder === 'true' && ratio > 0.25 && ratio < 0.75) return { type: 'into', folderId: id };
    return { type: ratio < 0.5 ? 'before' : 'after', id };
  }
  const zone = el.closest('[data-dnd-zone]') as HTMLElement | null;
  if (zone) {
    try {
      return JSON.parse(zone.dataset.dndZone!) as Target;
    } catch {
      return null;
    }
  }
  return null;
}

function finishDrop(id: ID, t: Target | null) {
  if (!t) return;
  if (t.type === 'stage') {
    stageDropHandler?.(id);
    return;
  }
  act((d) => dropItem(d, id, t));
}

/** Makes a sidebar row draggable and a drop target. */
export function useDragRow(id: ID, isFolder: boolean, axis: 'x' | 'y' = 'y') {
  const el = useRef<HTMLElement | null>(null);
  const dropHint = useDnd((st) => {
    const t = st.target;
    if (!t || st.dragging === id) return null;
    if ((t.type === 'before' || t.type === 'after') && t.id === id) return t.type;
    if (t.type === 'into' && t.folderId === id) return 'into';
    return null;
  });
  const isDragging = useDnd((st) => st.dragging === id);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button.row-btn, input')) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    let ghost: HTMLDivElement | null = null;

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
        started = true;
        useDnd.setState({ dragging: id, target: null });
        document.body.classList.add('dragging');
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.dataset.testid = 'drag-ghost';
        const it = getS().items[id];
        ghost.textContent = it ? displayTitle(it) : '';
        (el.current?.closest('.app') ?? document.body).appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
      useDnd.setState({ target: targetAt(ev.clientX, ev.clientY, id) });
    };
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key, true);
      ghost?.remove();
      document.body.classList.remove('dragging');
      const t = useDnd.getState().target;
      useDnd.setState({ dragging: null, target: null });
      if (started) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        if (commit) finishDrop(id, t);
      }
    };
    const up = () => end(true);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        end(false);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key, true);
  };

  return {
    setRef: (node: HTMLElement | null) => {
      el.current = node;
    },
    dropHint,
    handlers: {
      onPointerDown,
      onClickCapture: (e: React.MouseEvent) => {
        if (suppressClick) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      'data-dnd-row': id,
      'data-dnd-folder': isFolder ? 'true' : undefined,
      'data-dnd-axis': axis,
      'data-dragging': isDragging || undefined,
    },
  };
}

/** An area that accepts drops (end of a list, a Space button, the page). */
export function DropZone({ zone, children, className, testId, ...rest }: { zone: Zone; children?: React.ReactNode; className?: string; testId?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const key = zoneKey(zone);
  const over = useDnd((st) => st.dragging !== null && zoneKey(st.target) === key);
  return (
    <div {...rest} className={className} data-testid={testId} data-dnd-zone={JSON.stringify(zone)} data-over={over || undefined}>
      {children}
    </div>
  );
}

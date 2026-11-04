import { X, ArrowLeftRight, Rows2, Columns2, SquareArrowOutUpRight } from 'lucide-react';
import type { ID, Item, SplitItem } from '@shared/types';
import { displayTitle } from '@shared/ops';
import { moveDivider, movePane, resetSizes, separatePane, setOrientation } from '@shared/split';
import { act, useKite } from '../store';
import { closeItemCmd, selectItem } from '../commands';
import { now } from '../platform';
import { SiteIcon } from './SiteIcon';

type Rect = { left: number; top: number; width: number; height: number };

/** Where each pane of a split view sits, in percent of the page card. */
export function splitRects(split: SplitItem): Record<ID, Rect> {
  const out: Record<ID, Rect> = {};
  let pos = 0;
  split.panes.forEach((id, i) => {
    const size = (split.sizes[i] ?? 1 / split.panes.length) * 100;
    out[id] = split.orientation === 'row' ? { left: pos, top: 0, width: size, height: 100 } : { left: 0, top: pos, width: 100, height: size };
    pos += size;
  });
  return out;
}

export const PANE_GAP = 4; // px between panes
export const PANE_BAR = 30; // px header above each pane

/** CSS position for a pane's page, leaving room for the gap and its header. */
export function paneStyle(r: Rect): React.CSSProperties {
  return {
    left: `calc(${r.left}% + ${PANE_GAP}px)`,
    top: `calc(${r.top}% + ${PANE_GAP + PANE_BAR}px)`,
    width: `calc(${r.width}% - ${PANE_GAP * 2}px)`,
    height: `calc(${r.height}% - ${PANE_GAP * 2 + PANE_BAR}px)`,
  };
}

export function SplitChrome({ split }: { split: SplitItem }) {
  const rects = splitRects(split);
  const items = useKite((st) => st.s.items);
  const vertical = split.orientation === 'column';
  return (
    <div className="split-chrome" data-testid="split-chrome" data-orientation={split.orientation}>
      {split.panes.map((id, i) => {
        const r = rects[id];
        const tab = items[id];
        if (!tab || tab.kind !== 'tab') return null;
        return (
          <div
            key={id}
            className="pane-frame"
            data-focused={split.focused === i || undefined}
            data-testid={`pane-${i}`}
            style={{ left: `calc(${r.left}% + ${PANE_GAP}px)`, top: `calc(${r.top}% + ${PANE_GAP}px)`, width: `calc(${r.width}% - ${PANE_GAP * 2}px)`, height: `calc(${r.height}% - ${PANE_GAP * 2}px)` }}
          >
            <div className="pane-bar" onMouseDown={() => selectItem(id)} onDoubleClick={() => act((d) => resetSizes(d, split.id))}>
              <SiteIcon url={tab.url} favicon={tab.favicon} title={tab.title} size={14} />
              <span className="pane-title">{displayTitle(tab)}</span>
              <span className="pane-actions">
                {split.panes.length > 1 && (
                  <button className="icon-btn tiny" title="Swap with next pane" aria-label="Swap" data-testid={`pane-swap-${i}`} onClick={() => act((d) => movePane(d, split.id, i, (i + 1) % split.panes.length))}>
                    <ArrowLeftRight size={12} />
                  </button>
                )}
                <button
                  className="icon-btn tiny"
                  title={vertical ? 'Side by side' : 'Stack vertically'}
                  aria-label="Flip layout"
                  data-testid={`pane-flip-${i}`}
                  onClick={() => act((d) => setOrientation(d, split.id, vertical ? 'row' : 'column'))}
                >
                  {vertical ? <Columns2 size={12} /> : <Rows2 size={12} />}
                </button>
                <button className="icon-btn tiny" title="Separate into its own tab" aria-label="Separate" data-testid={`pane-separate-${i}`} onClick={() => act((d) => separatePane(d, split.id, id, now()))}>
                  <SquareArrowOutUpRight size={12} />
                </button>
                <button className="icon-btn tiny" title="Close pane" aria-label="Close pane" data-testid={`pane-close-${i}`} onClick={() => closeItemCmd(id)}>
                  <X size={12} />
                </button>
              </span>
            </div>
          </div>
        );
      })}
      {split.panes.slice(0, -1).map((id, i) => {
        const r = rects[id];
        const at = vertical ? r.top + r.height : r.left + r.width;
        return (
          <div
            key={`div-${i}`}
            className="split-divider"
            data-testid={`divider-${i}`}
            role="separator"
            aria-orientation={vertical ? 'horizontal' : 'vertical'}
            style={vertical ? { top: `calc(${at}% - 5px)` } : { left: `calc(${at}% - 5px)` }}
            onDoubleClick={() => act((d) => resetSizes(d, split.id))}
            onPointerDown={(e) => {
              e.preventDefault();
              const card = (e.currentTarget.closest('.card') as HTMLElement).getBoundingClientRect();
              document.body.classList.add('resizing');
              if (vertical) document.body.classList.add('resizing-v');
              const move = (ev: PointerEvent) => {
                const frac = vertical ? (ev.clientY - card.top) / card.height : (ev.clientX - card.left) / card.width;
                act((d) => moveDivider(d, split.id, i, frac));
              };
              const up = () => {
                document.body.classList.remove('resizing', 'resizing-v');
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        );
      })}
    </div>
  );
}

export function splitTitle(split: SplitItem, items: Record<ID, Item>): string {
  return split.panes
    .map((p) => items[p])
    .filter(Boolean)
    .map((t) => displayTitle(t))
    .join(' | ');
}

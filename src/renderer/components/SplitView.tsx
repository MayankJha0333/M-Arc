import type { ID, SplitItem } from '@shared/types';

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

export function SplitChrome(_: { split: SplitItem }) {
  return null;
}

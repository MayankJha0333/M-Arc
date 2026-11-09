// Which tabs keep their page loaded. Older ones "sleep": their page is unloaded to
// save memory and reloads when you open the tab again.

import type { ID } from './types';

/**
 * Add `id` as the most recently used tab and drop the oldest ones beyond `limit`.
 * Tabs in `keep` (playing sound, video popped out, visible in a split) never sleep.
 */
export function keepAwake(loaded: ID[], id: ID, limit: number, keep: (id: ID) => boolean = () => false): ID[] {
  const order = [...loaded.filter((x) => x !== id), id];
  let extra = order.length - Math.max(1, limit);
  if (extra <= 0) return order;
  const out: ID[] = [];
  for (const x of order) {
    if (extra > 0 && x !== id && !keep(x)) {
      extra--;
      continue;
    }
    out.push(x);
  }
  return out;
}

/** Put every tab to sleep except the ones in `keep`. */
export function sleepAllBut(loaded: ID[], keep: (id: ID) => boolean): ID[] {
  return loaded.filter(keep);
}

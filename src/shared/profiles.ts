// Profiles: which cookie jar ("partition") a page uses.
//
// Every Space shares one jar by default. A Space marked "isolated" gets its own:
// separate cookies, logins, site storage and cache. Favorites are shared across
// Spaces, so they always use the shared jar.

import { locate, ownerSplit } from './tree';
import type { AppState, ID, Space } from './types';

export const DEFAULT_PARTITION = 'persist:kite';
const PREFIX = 'persist:kite-space-';

export function partitionForSpace(sp: Pick<Space, 'id' | 'isolated'> | undefined | null): string {
  if (!sp?.isolated) return DEFAULT_PARTITION;
  return PREFIX + sp.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

/** Only Kite's own jars may be used by a page (checked in the main process). */
export function isKitePartition(p: unknown): p is string {
  return p === DEFAULT_PARTITION || (typeof p === 'string' && /^persist:kite-space-[A-Za-z0-9_-]{1,48}$/.test(p));
}

/** The jar for a tab: its Space's jar, or the shared one for Favorites and unknown tabs. */
export function partitionForTab(s: AppState, tabId: ID): string {
  let loc = locate(s, tabId);
  if (!loc) {
    const sp = ownerSplit(s, tabId);
    loc = sp ? locate(s, sp.id) : null;
  }
  if (!loc || loc.list === 'favorites' || !loc.spaceId) return DEFAULT_PARTITION;
  return partitionForSpace(s.spaces.find((x) => x.id === loc!.spaceId));
}

/** Jars that no Space uses any more (their data can be erased). */
export function orphanPartitions(s: AppState, known: string[]): string[] {
  const used = new Set(s.spaces.map((sp) => partitionForSpace(sp)));
  return known.filter((p) => p !== DEFAULT_PARTITION && isKitePartition(p) && !used.has(p));
}

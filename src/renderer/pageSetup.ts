// Runs every time a page finishes loading: installs the link catcher
// (for Peek / little window) and applies matching Boosts.

import { useEffect, useRef } from 'react';
import { linkCatcherScript, type LinkPolicy } from '@shared/links';
import { locate, ownerSplit } from '@shared/tree';
import { hostOf } from '@shared/url';
import type { AppState, ID } from '@shared/types';
import { getS, useKite } from './store';
import { isMac } from './platform';
import { surface, type SurfaceHandle } from './surfaces';
import { applyBoosts } from './boostRuntime';
import { NONCE } from './nonce';

/** Host a pinned/favorite tab "belongs" to, or null for normal tabs. */
export function pinnedHostFor(tabId: ID, s: AppState = getS()): string | null {
  const tab = s.items[tabId];
  if (!tab || tab.kind !== 'tab') return null;
  let loc = locate(s, tabId);
  if (!loc) {
    const sp = ownerSplit(s, tabId);
    loc = sp ? locate(s, sp.id) : null;
  }
  if (!loc || loc.list === 'today') return null;
  return hostOf(tab.homeUrl ?? tab.url) || null;
}

export function policyFor(tabId: ID, isPeek: boolean, s: AppState = getS()): LinkPolicy {
  return {
    pinnedHost: isPeek ? null : pinnedHostFor(tabId, s),
    peekOnExternal: s.settings.peekOnExternalLinksFromPinned,
    peekOnShift: s.settings.peekOnShiftClick,
    isPeek,
    isMac,
  };
}

export function setupPage(tabId: ID, handle: SurfaceHandle, url: string, isPeek: boolean) {
  handle.execHidden(linkCatcherScript(policyFor(tabId, isPeek), NONCE)).catch(() => undefined);
  void applyBoosts(tabId, handle, url);
}

/** Keep a live page's link rules in sync when the tab is pinned/unpinned or settings change. */
export function usePolicySync(tabId: ID, isPeek: boolean) {
  const key = useKite((st) => JSON.stringify(policyFor(tabId, isPeek, st.s)));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    surface(tabId)?.execHidden(linkCatcherScript(JSON.parse(key), NONCE)).catch(() => undefined);
  }, [key, tabId]);
}

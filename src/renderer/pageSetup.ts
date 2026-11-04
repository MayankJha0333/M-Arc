// Runs every time a page finishes loading: installs the link catcher
// (for Peek / little window) and applies matching Boosts.

import { linkCatcherScript } from '@shared/links';
import { locate, ownerSplit } from '@shared/tree';
import { hostOf } from '@shared/url';
import type { ID } from '@shared/types';
import { getS } from './store';
import { isMac } from './platform';
import type { SurfaceHandle } from './surfaces';
import { applyBoosts } from './boostRuntime';

/** Host a pinned/favorite tab "belongs" to, or null for normal tabs. */
export function pinnedHostFor(tabId: ID): string | null {
  const s = getS();
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

export function setupPage(tabId: ID, handle: SurfaceHandle, url: string, isPeek: boolean) {
  const s = getS();
  const policy = {
    pinnedHost: isPeek ? null : pinnedHostFor(tabId),
    peekOnExternal: s.settings.peekOnExternalLinksFromPinned,
    peekOnShift: s.settings.peekOnShiftClick,
    isPeek,
    isMac,
  };
  handle.exec(linkCatcherScript(policy)).catch(() => undefined);
  void applyBoosts(tabId, handle, url);
}

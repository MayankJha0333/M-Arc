// Handles links that arrive from pages (new tab, background tab, peek)
// and from other apps (link routing is added by the routing feature).

import type { OpenRequest } from '@shared/ipc';
import { openUrl } from './commands';
import { routeFor } from '@shared/routing';
import { getS, toast } from './store';

export function handleOpenRequest(req: OpenRequest) {
  switch (req.disposition) {
    case 'background-tab':
      openUrl(req.url, 'background');
      break;
    case 'peek':
      openUrl(req.url, 'peek', { sourceTabId: req.sourceTabId });
      break;
    case 'little':
      openUrl(req.url, 'little');
      break;
    default:
      openUrl(req.url, 'new');
  }
}

/** A link arrived from another app (Kite is the default browser). */
export function handleExternalUrl(url: string) {
  const s = getS();
  const { target } = routeFor(s, url);
  if (target.type === 'little') {
    openUrl(url, 'little');
    return;
  }
  if (target.type === 'space') {
    const sp = s.spaces.find((x) => x.id === target.spaceId);
    openUrl(url, 'new', { spaceId: target.spaceId });
    if (sp && sp.id !== s.activeSpaceId) toast(`Opened in ${sp.icon} ${sp.name}`);
    return;
  }
  openUrl(url, 'new');
}

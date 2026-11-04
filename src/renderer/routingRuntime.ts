// Handles links that arrive from pages (new tab, background tab, peek)
// and from other apps (link routing is added by the routing feature).

import type { OpenRequest } from '@shared/ipc';
import { openUrl } from './commands';

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

export function handleExternalUrl(url: string) {
  openUrl(url, 'new');
}

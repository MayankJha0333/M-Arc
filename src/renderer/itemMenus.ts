// Right-click menus for sidebar items.

import * as ops from '@shared/ops';
import { locate } from '@shared/tree';
import type { ID } from '@shared/types';
import type { ContextMenuItem } from './store';
import { act, getS, setUi } from './store';
import { closeItemCmd, selectItem, copyActiveUrl, navigateTab } from './commands';
import { formatShortcut } from '@shared/shortcuts';
import { isMac } from './platform';
import { now } from './platform';

function shortcutHint(action: string) {
  return formatShortcut(getS().settings.shortcuts[action] ?? '', isMac);
}

export function itemMenu(id: ID): ContextMenuItem[] {
  const s = getS();
  const it = s.items[id];
  if (!it) return [];
  const loc = locate(s, id);
  const items: ContextMenuItem[] = [];

  if (it.kind === 'tab') {
    items.push(
      { label: 'Copy URL', testId: 'menu-copy-url', onSelect: () => { selectItem(id); void copyActiveUrl(); } },
      { label: 'Duplicate', testId: 'menu-duplicate', onSelect: () => { const n = act((d) => ops.duplicateTab(d, id, now())); if (n) selectItem(n); } },
    );
  }
  items.push({ label: 'Rename…', testId: 'menu-rename', onSelect: () => setUi({ renaming: id }) });
  items.push({ separator: true, label: '' });
  if (loc?.list === 'favorites') {
    items.push(
      { label: 'Remove from Favorites', testId: 'menu-unfavorite', onSelect: () => act((d) => ops.removeFavorite(d, id)) },
      { label: 'Move to Pinned', testId: 'menu-fav-to-pinned', onSelect: () => act((d) => ops.removeFavorite(d, id, 'pinned')) },
    );
  } else if (it.kind !== 'folder') {
    if (it.kind === 'tab') items.push({ label: 'Add to Favorites', testId: 'menu-favorite', onSelect: () => act((d) => ops.addFavorite(d, id)) });
    items.push(
      loc?.list === 'today'
        ? { label: 'Pin', hint: shortcutHint('togglePin'), testId: 'menu-pin', onSelect: () => act((d) => ops.pinItem(d, id)) }
        : { label: 'Unpin', hint: shortcutHint('togglePin'), testId: 'menu-unpin', onSelect: () => act((d) => ops.unpinItem(d, id)) },
    );
  }
  if (it.kind === 'tab' && it.homeUrl && it.url !== it.homeUrl) {
    items.push(
      { label: 'Back to Pinned Page', testId: 'menu-go-home', onSelect: () => navigateTab(id, it.homeUrl!) },
      { label: 'Make This Page the Pinned Page', testId: 'menu-set-home', onSelect: () => act((d) => ops.setHomeHere(d, id)) },
    );
  }
  items.push({ separator: true, label: '' });
  if (it.kind !== 'folder') {
    const keeps = it.kind === 'tab' && (loc?.list === 'pinned' || loc?.list === 'favorites');
    items.push({ label: keeps ? 'Close (keep in sidebar)' : 'Close', hint: '', testId: 'menu-close', onSelect: () => closeItemCmd(id) });
  }
  return items;
}

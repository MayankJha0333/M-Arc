// Right-click menus for sidebar items.

import * as ops from '@shared/ops';
import { locate } from '@shared/tree';
import type { ID } from '@shared/types';
import type { ContextMenuItem } from './store';
import { act, getS, setUi } from './store';
import { closeItemCmd, selectItem, copyActiveUrl } from './commands';
import { now } from './platform';

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
  if (it.kind !== 'folder') {
    const keeps = it.kind === 'tab' && (loc?.list === 'pinned' || loc?.list === 'favorites');
    items.push({ label: keeps ? 'Close (keep in sidebar)' : 'Close', hint: '', testId: 'menu-close', onSelect: () => closeItemCmd(id) });
  }
  return items;
}

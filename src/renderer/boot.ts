// Starts the app: loads saved state, turns on autosave, wires keyboard + main-process events.

import { useEffect } from 'react';
import { loadState } from '@shared/persistence';
import { findAction } from '@shared/shortcuts';
import * as ops from '@shared/ops';
import type { Settings } from '@shared/types';
import { bridge, isMac } from './platform';
import { getS, getUi, markLoaded, startAutosave, useKite } from './store';
import { openUrl, runAction, autoArchiveNow, openInSplit } from './commands';
import { handleOpenRequest, handleExternalUrl } from './routingRuntime';
import { watchBoosts } from './boostRuntime';
import { startPip } from './pipRuntime';

/** All shortcuts including the numbered ones (⌘1…⌘9, ⌃1…⌃9). */
export function fullShortcutMap(settings: Settings): Record<string, string> {
  const map: Record<string, string> = { ...settings.shortcuts };
  for (let n = 1; n <= 9; n++) {
    map[`tab${n}`] = `mod+${n}`;
    map[`space${n}`] = `ctrl+${n}`;
  }
  return map;
}

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;
  const raw = await bridge.loadState().catch(() => null);
  const state = loadState(raw);
  useKite.getState().load(state);
  startAutosave();
  watchBoosts();
  startPip();
  const active = ops.activeItemId(state);
  if (active) {
    const it = state.items[active];
    if (it.kind === 'tab') markLoaded(active);
    if (it.kind === 'split') it.panes.forEach(markLoaded);
  }

  // Auto-archive: once at launch (Kite may have been closed for days), then every minute.
  autoArchiveNow();
  setInterval(autoArchiveNow, 60_000);

  bridge.onShortcut((a) => runAction(a));
  bridge.onOpen((req) => handleOpenRequest(req));
  bridge.onExternalUrl((url) => handleExternalUrl(url));
  bridge.onOpenSplit(({ url }) => openInSplit(url));
  bridge.onLittleToMain(({ url, spaceId }) => openUrl(url, 'new', { spaceId: spaceId ?? undefined }));
  bridge.onLittleArchived(({ url, title }) =>
    useKite.getState().act((d) => {
      d.archive.unshift({ id: `arc_little_${Date.now()}`, title, url, kind: 'tab', spaceId: d.activeSpaceId, archivedAt: Date.now(), reason: 'auto' });
    }),
  );

  // Keep the main process's copy of shortcuts current (it forwards keys typed inside pages).
  let lastMap = '';
  const syncShortcuts = () => {
    const s = getS().settings;
    const json = JSON.stringify([fullShortcutMap(s), s.littleHotkey]);
    if (json === lastMap) return;
    lastMap = json;
    bridge.setShortcuts(fullShortcutMap(s), s.littleHotkey);
  };
  syncShortcuts();
  useKite.subscribe((st, prev) => {
    if (st.s.settings !== prev.s.settings) syncShortcuts();
  });

  // Dropping a link on Kite opens it as a tab (and never navigates Kite's own window).
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.some((t) => t === 'text/uri-list' || t === 'Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    if (!e.dataTransfer?.types.some((t) => t === 'text/uri-list' || t === 'Files')) return;
    e.preventDefault();
    const url = text.split('\n').map((x) => x.trim()).find((x) => /^https?:\/\//i.test(x));
    if (url) openUrl(url, 'new');
  });

  window.addEventListener(
    'keydown',
    (e) => {
      const ui = getUi();
      const action = findAction(e, fullShortcutMap(getS().settings), isMac);
      if (e.key === 'Escape' && !action) {
        if (ui.menu) return useKite.getState().setUi({ menu: null });
        return;
      }
      if (!action) return;
      // While recording a new shortcut in Settings, let the recorder have the key.
      if ((e.target as HTMLElement)?.closest?.('[data-recording="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      runAction(action);
    },
    true,
  );
}

export function useBoot() {
  useEffect(() => {
    void boot();
  }, []);
}

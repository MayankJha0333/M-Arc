// Applies Boosts to live pages: CSS updates instantly as you edit;
// scripts run once per page load.

import { boostsFor, buildBoostCss, wrapBoostJs } from '@shared/boosts';
import type { AppState, ID } from '@shared/types';
import type { SurfaceHandle } from './surfaces';
import { surface } from './surfaces';
import { getS, getUi, useKite } from './store';

/** CSS keys inserted into each live page, so they can be swapped out. */
const inserted = new Map<string, string[]>();

async function apply(state: Pick<AppState, 'boosts' | 'settings'>, handle: SurfaceHandle, url: string, key: string, runJs: boolean) {
  for (const k of inserted.get(key) ?? []) await handle.removeCSS(k).catch(() => undefined);
  const keys: string[] = [];
  const boosts = boostsFor(state, url);
  for (const b of boosts) {
    const css = buildBoostCss(b);
    if (!css) continue;
    const k = await handle.insertCSS(css).catch(() => null);
    if (k) keys.push(k);
  }
  inserted.set(key, keys);
  if (runJs) for (const b of boosts) if (b.js.trim()) await handle.exec(wrapBoostJs(b)).catch(() => undefined);
}

export async function applyBoosts(tabId: ID, handle: SurfaceHandle, url: string): Promise<void> {
  inserted.delete(tabId); // a fresh page load has no inserted CSS
  await apply(getS(), handle, url, tabId, true);
}

/** Same, for windows that don't own the saved state (the little window). */
export async function applyBoostsWith(state: AppState, handle: SurfaceHandle, url: string): Promise<void> {
  inserted.delete('little');
  await apply(state, handle, url, 'little', true);
}

/** Re-apply CSS to every live page (after a Boost is edited or toggled). */
export function reapplyLive() {
  const s = getS();
  for (const id of getUi().loaded) {
    const it = s.items[id];
    const h = surface(id);
    if (it?.kind === 'tab' && h) void apply(s, h, it.url, id, false);
  }
}

let watching = false;
export function watchBoosts() {
  if (watching) return;
  watching = true;
  useKite.subscribe((st, prev) => {
    if (st.s.boosts !== prev.s.boosts || st.s.settings.boostsEnabled !== prev.s.settings.boostsEnabled) reapplyLive();
  });
}

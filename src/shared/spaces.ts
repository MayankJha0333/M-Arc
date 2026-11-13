// Spaces: separate sets of pinned + today tabs, each with its own look.

import { defaultTheme, makeSpace } from './defaults';
import type { AppState, ID, SpaceTheme } from './types';
import { archiveItem } from './archive';

export interface NewSpaceOpts {
  name?: string;
  icon?: string;
  theme?: Partial<SpaceTheme>;
  activate?: boolean;
}

export function createSpace(s: AppState, o: NewSpaceOpts = {}): ID {
  const sp = makeSpace(o.name?.trim() || `Space ${s.spaces.length + 1}`, o.icon || '✦', s.spaces.length);
  sp.theme = { ...defaultTheme(s.spaces.length), ...(o.theme ?? {}) };
  s.spaces.push(sp);
  s.activeBySpace[sp.id] = null;
  if (o.activate !== false) s.activeSpaceId = sp.id;
  return sp.id;
}

/** Delete a Space. Everything in it goes to the Archive. The last Space can't be deleted. */
export function deleteSpace(s: AppState, id: ID, now: number): boolean {
  const i = s.spaces.findIndex((x) => x.id === id);
  if (i < 0 || s.spaces.length <= 1) return false;
  const sp = s.spaces[i];
  for (const item of [...sp.pinned, ...sp.today]) archiveItem(s, item, now, 'manual');
  s.spaces.splice(i, 1);
  delete s.activeBySpace[id];
  for (const r of s.routes) if (r.target.type === 'space' && r.target.spaceId === id) r.enabled = false;
  if (s.activeSpaceId === id) s.activeSpaceId = s.spaces[Math.max(0, i - 1)].id;
  return true;
}

export function updateSpace(s: AppState, id: ID, patch: { name?: string; icon?: string; archiveAfterMs?: number | null | undefined; isolated?: boolean }): void {
  const sp = s.spaces.find((x) => x.id === id);
  if (!sp) return;
  if (patch.name !== undefined && patch.name.trim()) sp.name = patch.name.trim();
  if (patch.icon !== undefined && patch.icon.trim()) sp.icon = [...patch.icon.trim()].slice(0, 2).join('');
  if (patch.isolated !== undefined) sp.isolated = patch.isolated || undefined;
  if ('archiveAfterMs' in patch) sp.archiveAfterMs = patch.archiveAfterMs;
}

export function setSpaceTheme(s: AppState, id: ID, patch: Partial<SpaceTheme>): void {
  const sp = s.spaces.find((x) => x.id === id);
  if (!sp) return;
  sp.theme = { ...sp.theme, ...patch };
  sp.theme.intensity = Math.max(0, Math.min(1, sp.theme.intensity));
}

export function switchSpace(s: AppState, id: ID): boolean {
  if (!s.spaces.some((x) => x.id === id)) return false;
  s.activeSpaceId = id;
  return true;
}

/** Next/previous Space, wrapping around. */
export function stepSpace(s: AppState, dir: 1 | -1): ID {
  const i = s.spaces.findIndex((x) => x.id === s.activeSpaceId);
  const next = s.spaces[(i + dir + s.spaces.length) % s.spaces.length];
  s.activeSpaceId = next.id;
  return next.id;
}

/** ⌃1…⌃9 (9 = last). */
export function nthSpace(s: AppState, n: number): boolean {
  const sp = n >= 9 ? s.spaces[s.spaces.length - 1] : s.spaces[n - 1];
  if (!sp) return false;
  s.activeSpaceId = sp.id;
  return true;
}

export function moveSpace(s: AppState, id: ID, toIndex: number): void {
  const i = s.spaces.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [sp] = s.spaces.splice(i, 1);
  s.spaces.splice(Math.max(0, Math.min(toIndex, s.spaces.length)), 0, sp);
}

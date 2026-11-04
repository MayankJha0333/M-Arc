// Link routing: rules that decide where links from other apps open.

import { newId } from './ids';
import type { AppState, ID, RouteMatchType, RouteRule, RouteTarget } from './types';
import { hostMatches, hostOf } from './url';
import { normalizeDomain } from './boosts';

export const MATCH_LABELS: Record<RouteMatchType, string> = {
  host: 'Site is',
  contains: 'Link contains',
  prefix: 'Link starts with',
};

export function addRoute(s: AppState, r: { matchType?: RouteMatchType; value?: string; target?: RouteTarget } = {}): ID {
  const id = newId('route');
  s.routes.push({ id, matchType: r.matchType ?? 'host', value: r.value ?? '', target: r.target ?? { type: 'space', spaceId: s.activeSpaceId }, enabled: true });
  return id;
}

export function updateRoute(s: AppState, id: ID, patch: Partial<Omit<RouteRule, 'id'>>): void {
  const r = s.routes.find((x) => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
}

export function deleteRoute(s: AppState, id: ID): void {
  s.routes = s.routes.filter((r) => r.id !== id);
}

/** Rules are checked top to bottom; move one up or down. */
export function moveRoute(s: AppState, id: ID, dir: -1 | 1): void {
  const i = s.routes.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.routes.length) return;
  [s.routes[i], s.routes[j]] = [s.routes[j], s.routes[i]];
}

export function ruleMatches(r: RouteRule, url: string): boolean {
  const v = r.value.trim().toLowerCase();
  if (!v) return false;
  const u = url.toLowerCase();
  switch (r.matchType) {
    case 'host': {
      const d = normalizeDomain(v);
      return !!d && hostMatches(hostOf(url), d);
    }
    case 'contains':
      return u.includes(v);
    case 'prefix': {
      const strip = (x: string) => x.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
      return strip(u).startsWith(strip(v));
    }
  }
}

/** Where a link from another app should open. */
export function routeFor(s: Pick<AppState, 'routes' | 'spaces' | 'settings'>, url: string): { target: RouteTarget; rule: RouteRule | null } {
  for (const r of s.routes) {
    if (!r.enabled || !ruleMatches(r, url)) continue;
    if (r.target.type === 'space' && !s.spaces.some((x) => x.id === (r.target as { spaceId: ID }).spaceId)) continue;
    return { target: r.target, rule: r };
  }
  return { target: s.settings.externalLinksTarget === 'little' ? { type: 'little' } : { type: 'active' }, rule: null };
}

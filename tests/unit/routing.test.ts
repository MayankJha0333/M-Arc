import { describe, expect, it } from 'vitest';
import { addRoute, deleteRoute, moveRoute, routeFor, ruleMatches, updateRoute } from '@shared/routing';
import { createSpace, deleteSpace } from '@shared/spaces';
import { fresh, run, T0 } from './helpers';
import type { RouteRule } from '@shared/types';

const rule = (matchType: RouteRule['matchType'], value: string): RouteRule => ({ id: 'r', matchType, value, target: { type: 'little' }, enabled: true });

describe('ruleMatches', () => {
  it('“site is” matches the site and its subdomains', () => {
    expect(ruleMatches(rule('host', 'spotify.com'), 'https://open.spotify.com/track/1')).toBe(true);
    expect(ruleMatches(rule('host', 'https://www.spotify.com/'), 'https://spotify.com')).toBe(true);
    expect(ruleMatches(rule('host', 'spotify.com'), 'https://notspotify.com')).toBe(false);
  });
  it('“contains” and “starts with” compare the link text', () => {
    expect(ruleMatches(rule('contains', 'meet'), 'https://meet.google.com/abc')).toBe(true);
    expect(ruleMatches(rule('contains', 'MEET'), 'https://meet.google.com/abc')).toBe(true);
    expect(ruleMatches(rule('prefix', 'github.com/my-org'), 'https://github.com/my-org/repo')).toBe(true);
    expect(ruleMatches(rule('prefix', 'https://www.github.com/my-org'), 'https://github.com/my-org/repo')).toBe(true);
    expect(ruleMatches(rule('prefix', 'github.com/my-org'), 'https://github.com/other')).toBe(false);
  });
  it('empty rules never match', () => {
    expect(ruleMatches(rule('contains', '  '), 'https://x.com')).toBe(false);
    expect(ruleMatches(rule('host', 'nope'), 'https://x.com')).toBe(false);
  });
});

describe('routeFor', () => {
  it('first matching enabled rule wins; otherwise the default', () => {
    let s = fresh();
    let work: string;
    [s, work] = run(s, (d) => createSpace(d, { name: 'Work', activate: false }));
    let r1: string, r2: string;
    [s, r1] = run(s, (d) => addRoute(d, { matchType: 'host', value: 'figma.com', target: { type: 'space', spaceId: work } }));
    [s, r2] = run(s, (d) => addRoute(d, { matchType: 'contains', value: 'figma', target: { type: 'little' } }));
    expect(routeFor(s, 'https://www.figma.com/file/1').target).toEqual({ type: 'space', spaceId: work });
    [s] = run(s, (d) => moveRoute(d, r2, -1));
    expect(routeFor(s, 'https://www.figma.com/file/1').target).toEqual({ type: 'little' });
    [s] = run(s, (d) => updateRoute(d, r2, { enabled: false }));
    expect(routeFor(s, 'https://www.figma.com/file/1').rule?.id).toBe(r1);
    expect(routeFor(s, 'https://other.com').target).toEqual({ type: 'little' }); // default setting
    [s] = run(s, (d) => {
      d.settings.externalLinksTarget = 'active';
    });
    expect(routeFor(s, 'https://other.com')).toEqual({ target: { type: 'active' }, rule: null });
    [s] = run(s, (d) => deleteRoute(d, r1));
    expect(s.routes).toHaveLength(1);
  });

  it('skips rules pointing at a deleted Space', () => {
    let s = fresh();
    let gone: string;
    [s, gone] = run(s, (d) => createSpace(d, { name: 'Gone' }));
    [s] = run(s, (d) => addRoute(d, { value: 'x.com', target: { type: 'space', spaceId: gone } }));
    [s] = run(s, (d) => deleteSpace(d, gone, T0));
    expect(routeFor(s, 'https://x.com').rule).toBeNull();
  });

  it('new rules default to the current Space', () => {
    const [s] = run(fresh(), (d) => addRoute(d));
    expect(s.routes[0]).toMatchObject({ matchType: 'host', value: '', enabled: true, target: { type: 'space', spaceId: s.activeSpaceId } });
  });
});

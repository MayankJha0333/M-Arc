import { describe, expect, it } from 'vitest';
import { matchRanges, matchScore, suggest } from '@shared/commandbar';
import { newTab, recordVisit } from '@shared/ops';
import { createSpace } from '@shared/spaces';
import { fresh, run, T0 } from './helpers';

describe('matchScore', () => {
  it('ranks exact > prefix > word start > substring > fuzzy > none', () => {
    const scores = [
      matchScore('git', 'git'),
      matchScore('git', 'github'),
      matchScore('git', 'my github'),
      matchScore('git', 'legitimate'),
      matchScore('ghb', 'github'),
      matchScore('xyz', 'github'),
    ];
    for (let i = 0; i < scores.length - 1; i++) expect(scores[i]).toBeGreaterThan(scores[i + 1]);
    expect(scores[5]).toBe(0);
  });
  it('is case-insensitive and handles regex characters', () => {
    expect(matchScore('GIT', 'GitHub')).toBeGreaterThan(0);
    expect(matchScore('c++', 'learn c++ fast')).toBeGreaterThan(0);
  });
  it('ignores letters scattered far apart', () => {
    expect(matchScore('new', 'en.wikipedia.org/wiki/kite')).toBe(0);
  });
  it('highlights matched letters', () => {
    expect(matchRanges('hub', 'GitHub')).toEqual([[3, 6]]);
    expect(matchRanges('ghb', 'GitHub')).toEqual([[0, 1], [3, 4], [5, 6]]);
    expect(matchRanges('zz', 'GitHub')).toEqual([]);
  });
});

describe('suggest', () => {
  function world() {
    let s = fresh();
    [s] = run(s, (d) => newTab(d, { url: 'https://github.com/kite', title: 'Kite repo', now: T0 }));
    [s] = run(s, (d) => newTab(d, { url: 'https://news.ycombinator.com', title: 'Hacker News', now: T0 + 5 }));
    [s] = run(s, (d) => {
      recordVisit(d, 'https://developer.mozilla.org/en-US/docs/Web', 'MDN Web Docs', T0);
      recordVisit(d, 'https://github.com/kite', 'Kite repo', T0); // already open as a tab
      recordVisit(d, 'https://www.figma.com/file/1', 'Design', T0);
      recordVisit(d, 'https://www.figma.com/file/2', 'Design', T0);
    });
    [s] = run(s, (d) => createSpace(d, { name: 'Work', activate: false }));
    return s;
  }

  it('with nothing typed, shows recently used tabs of this Space', () => {
    const r = suggest(world(), '');
    expect(r.map((x) => x.title)).toEqual(['Hacker News', 'Kite repo']);
    expect(r.every((x) => x.kind === 'tab')).toBe(true);
  });

  it('a strong match on an open tab comes first, then search', () => {
    const r = suggest(world(), 'hack');
    expect(r[0]).toMatchObject({ kind: 'tab', title: 'Hacker News' });
    expect(r[1]).toMatchObject({ kind: 'search', title: 'hack' });
  });

  it('weak matches put search first', () => {
    const r = suggest(world(), 'mdn docs');
    expect(r[0].kind).toBe('search');
  });

  it('a URL offers "open" first and still offers search', () => {
    const r = suggest(world(), 'example.org');
    expect(r[0]).toMatchObject({ kind: 'open', url: 'https://example.org' });
    expect(r.some((x) => x.kind === 'search')).toBe(true);
  });

  it('history skips pages that are already open and merges same-title pages on noisy sites', () => {
    const r = suggest(world(), 'design');
    const hist = r.filter((x) => x.kind === 'history');
    expect(hist).toHaveLength(1);
    const k = suggest(world(), 'kite');
    expect(k.filter((x) => x.kind === 'history')).toHaveLength(0);
    expect(k.filter((x) => x.kind === 'tab')).toHaveLength(1);
  });

  it('finds actions by title or keyword, and Spaces by name', () => {
    expect(suggest(world(), 'new note').some((x) => x.kind === 'action' && x.actionId === 'newNote')).toBe(true);
    expect(suggest(world(), 'preferences').some((x) => x.kind === 'action' && x.actionId === 'settings')).toBe(true);
    expect(suggest(world(), 'work').some((x) => x.kind === 'space')).toBe(true);
  });

  it('never returns more than the limit or duplicate keys', () => {
    const r = suggest(world(), 'e', { limit: 5 });
    expect(r.length).toBeLessThanOrEqual(5);
    expect(new Set(r.map((x) => x.key)).size).toBe(r.length);
  });
});

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { addZap, boostsFor, buildBoostCss, createBoost, deleteBoost, exportBoosts, importBoosts, isValidSelector, normalizeDomain, removeZap, updateBoost, wrapBoostJs } from '@shared/boosts';
import { selectorFor } from '@shared/zap';
import { fresh, run, T0 } from './helpers';
import type { Boost } from '@shared/types';

describe('boosts', () => {
  it('normalizes domains', () => {
    expect(normalizeDomain('https://www.News.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
    expect(normalizeDomain('*.github.com')).toBe('github.com');
    expect(normalizeDomain('example.com/path')).toBe('example.com');
    expect(normalizeDomain('not a domain')).toBe('');
    expect(normalizeDomain('localhost')).toBe('');
  });

  it('creates, edits, toggles and deletes', () => {
    let s = fresh();
    let id: string | null;
    [s, id] = run(s, (d) => createBoost(d, { domain: 'https://www.example.com/x', now: T0 }));
    expect(s.boosts[0]).toMatchObject({ domain: 'example.com', name: 'example.com', enabled: true });
    [s] = run(s, (d) => updateBoost(d, id!, { css: 'body{color:red}', name: 'Red', enabled: false, font: 'serif' }, T0 + 1));
    expect(s.boosts[0]).toMatchObject({ css: 'body{color:red}', name: 'Red', enabled: false, font: 'serif', updatedAt: T0 + 1 });
    [s] = run(s, (d) => updateBoost(d, id!, { domain: 'garbage!!' }, T0));
    expect(s.boosts[0].domain).toBe('example.com');
    [s] = run(s, (d) => deleteBoost(d, id!));
    expect(s.boosts).toEqual([]);
    const [, bad] = run(fresh(), (d) => createBoost(d, { domain: '', now: T0 }));
    expect(bad).toBeNull();
  });

  it('applies to the domain and its subdomains, only when enabled', () => {
    let s = fresh();
    let id: string | null;
    [s, id] = run(s, (d) => createBoost(d, { domain: 'example.com', now: T0 }));
    expect(boostsFor(s, 'https://example.com/a')).toHaveLength(1);
    expect(boostsFor(s, 'https://news.example.com/')).toHaveLength(1);
    expect(boostsFor(s, 'https://notexample.com/')).toHaveLength(0);
    expect(boostsFor(s, 'about:blank')).toHaveLength(0);
    [s] = run(s, (d) => updateBoost(d, id!, { enabled: false }, T0));
    expect(boostsFor(s, 'https://example.com/a')).toHaveLength(0);
    [s] = run(s, (d) => {
      updateBoost(d, id!, { enabled: true }, T0);
      d.settings.boostsEnabled = false;
    });
    expect(boostsFor(s, 'https://example.com/a')).toHaveLength(0);
  });

  it('zaps: adds unique valid selectors and removes them', () => {
    let s = fresh();
    let id: string | null;
    [s, id] = run(s, (d) => createBoost(d, { domain: 'example.com', now: T0 }));
    let ok: boolean;
    [s, ok] = run(s, (d) => addZap(d, id!, '#ad', T0));
    expect(ok).toBe(true);
    [s, ok] = run(s, (d) => addZap(d, id!, '#ad', T0));
    expect(ok).toBe(false);
    [s, ok] = run(s, (d) => addZap(d, id!, 'x} body{display:none', T0));
    expect(ok).toBe(false);
    [s] = run(s, (d) => removeZap(d, id!, '#ad', T0));
    expect(s.boosts[0].zaps).toEqual([]);
    expect(isValidSelector('div > p:nth-of-type(2)')).toBe(true);
  });

  it('builds CSS from zaps, font and custom CSS', () => {
    const b: Boost = { id: 'b', name: 'x', domain: 'x.com', enabled: true, css: 'h1 { color: red }', js: '', zaps: ['#ad', '.promo'], font: 'Georgia, serif', createdAt: 0, updatedAt: 0 };
    const css = buildBoostCss(b);
    expect(css).toContain('#ad,\n.promo { display: none !important; }');
    expect(css).toContain('font-family: Georgia, serif !important');
    expect(css).toContain('h1 { color: red }');
    expect(buildBoostCss({ ...b, css: 'a{}</style><script>', zaps: [], font: undefined })).not.toMatch(/<\/style/i);
  });

  it('really hides zapped elements in a page', () => {
    const dom = new JSDOM('<div id="ad">AD</div><p>keep</p>', { pretendToBeVisual: true });
    const style = dom.window.document.createElement('style');
    style.textContent = buildBoostCss({ id: 'b', name: 'x', domain: 'x.com', enabled: true, css: '', js: '', zaps: ['#ad'], createdAt: 0, updatedAt: 0 });
    dom.window.document.head.append(style);
    expect(dom.window.getComputedStyle(dom.window.document.getElementById('ad')!).display).toBe('none');
    expect(dom.window.getComputedStyle(dom.window.document.querySelector('p')!).display).not.toBe('none');
  });

  it('wraps scripts so errors stay contained', () => {
    const dom = new JSDOM('', { runScripts: 'outside-only' });
    const warnings: unknown[] = [];
    dom.window.console.warn = (...a: unknown[]) => warnings.push(a);
    dom.window.eval(wrapBoostJs({ id: 'b', name: 'Bad', domain: 'x.com', enabled: true, css: '', js: 'throw new Error("boom")', zaps: [], createdAt: 0, updatedAt: 0 }));
    expect(warnings).toHaveLength(1);
  });

  it('export leaves scripts out; import never brings scripts in', () => {
    let s = fresh();
    let id: string | null;
    [s, id] = run(s, (d) => createBoost(d, { domain: 'example.com', now: T0 }));
    [s] = run(s, (d) => updateBoost(d, id!, { css: 'p{}', js: 'alert(1)' }, T0));
    [s] = run(s, (d) => void addZap(d, id!, '#ad', T0));
    const text = exportBoosts(s.boosts);
    expect(text).not.toContain('alert(1)');
    const withJs = JSON.parse(text);
    withJs.boosts[0].js = 'alert(2)';
    withJs.boosts.push({ domain: '???' }, { domain: 'ok.com', zaps: ['a}b'] });
    let n: number;
    let t = fresh();
    [t, n] = run(t, (d) => importBoosts(d, JSON.stringify(withJs), T0));
    expect(n).toBe(2);
    expect(t.boosts[0]).toMatchObject({ domain: 'example.com', css: 'p{}', js: '', zaps: ['#ad'] });
    expect(t.boosts[1].zaps).toEqual([]);
    [, n] = run(fresh(), (d) => importBoosts(d, 'not json', T0));
    expect(n).toBe(0);
  });
});

describe('zap selector', () => {
  it('builds unique, readable selectors', () => {
    const dom = new JSDOM(`<body><div id="main"><ul class="list"><li>a</li><li class="hot">b</li><li>c</li></ul></div><div id="x9f83ab21">gen</div><section><p>1</p><p>2</p></section></body>`);
    const doc = dom.window.document;
    (globalThis as any).CSS = { escape: (s: string) => s };
    const check = (el: Element) => {
      const sel = selectorFor(el);
      expect(doc.querySelectorAll(sel)).toHaveLength(1);
      expect(doc.querySelector(sel)).toBe(el);
      return sel;
    };
    expect(check(doc.getElementById('main')!)).toBe('#main');
    check(doc.querySelectorAll('li')[2]);
    expect(check(doc.querySelector('li.hot')!)).toContain('hot');
    check(doc.querySelectorAll('p')[1]);
    expect(check(doc.getElementById('x9f83ab21')!)).not.toContain('x9f83ab21'); // generated ids are avoided
  });
});

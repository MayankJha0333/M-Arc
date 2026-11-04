// Boosts: per-site style changes (CSS, a font, hidden elements) and optional scripts.

import { newId } from './ids';
import type { AppState, Boost, ID } from './types';
import { hostMatches, hostOf } from './url';

export const BOOST_FONTS: { label: string; value: string }[] = [
  { label: 'Site default', value: '' },
  { label: 'System sans', value: "ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif" },
  { label: 'Serif (Georgia)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Rounded', value: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif" },
  { label: 'Monospace', value: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
];

/** Clean up what people type as a domain: "https://www.x.com/a" → "x.com". */
export function normalizeDomain(input: string): string {
  const t = input.trim().toLowerCase();
  if (!t) return '';
  const host = /^[a-z]+:\/\//.test(t) ? hostOf(t) : t.replace(/^\*\./, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : '';
}

export function createBoost(s: AppState, o: { domain: string; name?: string; now: number }): ID | null {
  const domain = normalizeDomain(o.domain);
  if (!domain) return null;
  const id = newId('boost');
  s.boosts.push({ id, name: o.name?.trim() || domain, domain, enabled: true, css: '', js: '', zaps: [], createdAt: o.now, updatedAt: o.now });
  return id;
}

export function updateBoost(s: AppState, id: ID, patch: Partial<Pick<Boost, 'name' | 'domain' | 'enabled' | 'css' | 'js' | 'font'>>, now: number): void {
  const b = s.boosts.find((x) => x.id === id);
  if (!b) return;
  if (patch.domain !== undefined) {
    const d = normalizeDomain(patch.domain);
    if (d) b.domain = d;
  }
  if (patch.name !== undefined) b.name = patch.name.trim() || b.domain;
  if (patch.enabled !== undefined) b.enabled = patch.enabled;
  if (patch.css !== undefined) b.css = patch.css;
  if (patch.js !== undefined) b.js = patch.js;
  if (patch.font !== undefined) b.font = patch.font || undefined;
  b.updatedAt = now;
}

export function deleteBoost(s: AppState, id: ID): void {
  s.boosts = s.boosts.filter((b) => b.id !== id);
}

export function addZap(s: AppState, id: ID, selector: string, now: number): boolean {
  const b = s.boosts.find((x) => x.id === id);
  const sel = selector.trim();
  if (!b || !sel || b.zaps.includes(sel) || !isValidSelector(sel)) return false;
  b.zaps.push(sel);
  b.updatedAt = now;
  return true;
}

export function removeZap(s: AppState, id: ID, selector: string, now: number): void {
  const b = s.boosts.find((x) => x.id === id);
  if (!b) return;
  b.zaps = b.zaps.filter((z) => z !== selector);
  b.updatedAt = now;
}

/** Rejects text that would break out of a CSS rule. */
export function isValidSelector(sel: string): boolean {
  return !/[{}]|<\/?style/i.test(sel) && sel.length < 500;
}

/** Boosts that apply to a page right now. */
export function boostsFor(s: Pick<AppState, 'boosts' | 'settings'>, url: string): Boost[] {
  if (!s.settings.boostsEnabled) return [];
  const host = hostOf(url);
  if (!host) return [];
  return s.boosts.filter((b) => b.enabled && hostMatches(host, b.domain));
}

/** The CSS injected into the page for one Boost. */
export function buildBoostCss(b: Boost): string {
  const parts: string[] = [];
  if (b.font) parts.push(`body, body *:not(code):not(pre):not(kbd):not(samp):not([class*="icon"]) { font-family: ${b.font} !important; }`);
  const zaps = b.zaps.filter(isValidSelector);
  if (zaps.length) parts.push(`${zaps.join(',\n')} { display: none !important; }`);
  if (b.css.trim()) parts.push(b.css.replace(/<\/style/gi, ''));
  return parts.join('\n');
}

/** Wraps a Boost's script so an error in it can't break the page. */
export function wrapBoostJs(b: Boost): string {
  return `(() => { try {\n${b.js}\n} catch (e) { console.warn('Kite Boost “${b.name.replace(/[^\w .-]/g, '')}” failed:', e); } })();`;
}

/** Export Boosts to share as a file. Scripts are never included (safety). */
export function exportBoosts(boosts: Boost[]): string {
  return JSON.stringify(
    { kind: 'kite-boosts', version: 1, boosts: boosts.map(({ name, domain, css, zaps, font }) => ({ name, domain, css, zaps, font: font ?? '' })) },
    null,
    2,
  );
}

/** Import Boosts from a file. Scripts are ignored even if present. Returns how many were added. */
export function importBoosts(s: AppState, text: string, now: number): number {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 0;
  }
  const list = (data as { boosts?: unknown[] })?.boosts;
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const raw of list) {
    const r = raw as Partial<Boost>;
    const domain = normalizeDomain(String(r.domain ?? ''));
    if (!domain) continue;
    const zaps = Array.isArray(r.zaps) ? r.zaps.map(String).filter(isValidSelector) : [];
    s.boosts.push({ id: newId('boost'), name: String(r.name || domain).slice(0, 80), domain, enabled: true, css: String(r.css ?? ''), js: '', zaps, font: r.font ? String(r.font) : undefined, createdAt: now, updatedAt: now });
    n++;
  }
  return n;
}

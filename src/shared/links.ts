// Deciding where a clicked link should open.
//
// decideLinkClick is self-contained on purpose (no imports, no outside names):
// the same function is turned into text and injected into web pages, so the
// page and the unit tests run exactly the same logic.

export interface LinkPolicy {
  pinnedHost: string | null;
  peekOnExternal: boolean;
  peekOnShift: boolean;
  isPeek: boolean;
  isMac: boolean;
}

export interface ClickInfo {
  href: string;
  pageUrl: string;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  button: number;
  targetBlank: boolean;
}

/** 'default' = let the page handle it normally. */
export type ClickDecision = 'default' | 'peek' | 'little';

export function decideLinkClick(p: LinkPolicy, c: ClickInfo): ClickDecision {
  if (c.button !== 0) return 'default';
  let target: URL;
  try {
    target = new URL(c.href, c.pageUrl);
  } catch {
    return 'default';
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return 'default';
  const mod = p.isMac ? c.meta : c.ctrl;
  if (c.alt && mod && !c.shift) return 'little';
  if (p.isPeek) return 'default';
  if (c.shift && !mod && !c.alt) return p.peekOnShift ? 'peek' : 'default';
  if (mod || c.alt) return 'default';
  if (!p.pinnedHost || !p.peekOnExternal) return 'default';
  const norm = (h: string) => h.toLowerCase().replace(/^www\./, '');
  const host = norm(target.hostname);
  const home = norm(p.pinnedHost);
  // Same site (or a subdomain either way) stays in the tab.
  const site = (h: string) => h.split('.').slice(-2).join('.');
  if (host === home || host.endsWith('.' + home) || home.endsWith('.' + host) || site(host) === site(home)) return 'default';
  return 'peek';
}

/**
 * Script injected into a page. It listens for clicks (capture phase, before
 * the page's own handlers) and reports decisions through console.debug with a
 * marker that the app watches for.
 */
export const LINK_MARKER = '__kite_link__';

export function linkCatcherScript(policy: LinkPolicy): string {
  return `(() => {
  if (window.__kiteLinkCatcher) { window.__kiteLinkCatcher.policy = ${JSON.stringify(policy)}; return; }
  const decide = ${decideLinkClick.toString()};
  const state = { policy: ${JSON.stringify(policy)} };
  window.__kiteLinkCatcher = state;
  document.addEventListener('click', (e) => {
    const a = e.composedPath ? e.composedPath().find((n) => n && n.tagName === 'A' && n.href) : e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const d = decide(state.policy, { href: a.getAttribute('href'), pageUrl: location.href, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, button: e.button, targetBlank: a.target === '_blank' });
    if (d === 'default') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    console.debug(${JSON.stringify(LINK_MARKER)} + JSON.stringify({ decision: d, url: a.href }));
  }, true);
})();`;
}

export function parseLinkMessage(message: string): { decision: ClickDecision; url: string } | null {
  if (!message.startsWith(LINK_MARKER)) return null;
  try {
    const v = JSON.parse(message.slice(LINK_MARKER.length));
    if (typeof v.url === 'string' && (v.decision === 'peek' || v.decision === 'little')) return v;
  } catch {
    /* ignore */
  }
  return null;
}

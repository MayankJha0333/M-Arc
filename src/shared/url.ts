// Turning what people type into URLs, and reading parts of URLs.

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_RE = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(:\d+)?(\/.*)?$/i;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/;
const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i;

/** True if the text looks like an address rather than a search. */
export function looksLikeUrl(input: string): boolean {
  const t = input.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^(https?|file|about|kite|data):/i.test(t)) return true;
  if (SCHEME_RE.test(t) && !/^[a-z0-9-]+\.[a-z]/i.test(t) && !/:\d+/.test(t)) return false;
  return LOCAL_RE.test(t) || IP_RE.test(t) || DOMAIN_RE.test(t);
}

/** Turn typed text into a URL: an address gets https://, anything else becomes a search. */
export function normalizeInput(input: string, searchTemplate: string): string {
  const t = input.trim();
  if (!t) return '';
  if (looksLikeUrl(t)) {
    if (/^(https?|file|about|kite|data):/i.test(t)) return t;
    const isLocal = LOCAL_RE.test(t) || IP_RE.test(t);
    return `${isLocal ? 'http' : 'https'}://${t}`;
  }
  return searchTemplate.replace('%s', encodeURIComponent(t));
}

/** "https://www.news.ycombinator.com/x" → "news.ycombinator.com" (www. dropped). */
export function hostOf(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}

/** True when host equals domain or is a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().trim().replace(/^www\./, '').replace(/^\*\./, '');
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/** Short display form of a URL for the sidebar/URL bar. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'kite:') return url;
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${hostOf(url)}${path}${u.search}`;
  } catch {
    return url;
  }
}

/** Fallback favicon letter for a site. */
export function siteLetter(url: string, title?: string): string {
  const h = hostOf(url);
  const src = h || title || '?';
  return src.charAt(0).toUpperCase();
}

/** Shortens noisy page titles: "foo/bar: A thing · GitHub" → "foo/bar: A thing". */
export function tidyTitle(title: string, url: string): string {
  const raw = title.trim();
  if (!raw) return raw;
  const host = hostOf(url);
  const site = host.split('.').slice(-2, -1)[0] ?? '';
  const parts = raw.split(/\s+[|·—–-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return raw;
  const isSiteName = (p: string) => {
    const n = p.toLowerCase().replace(/[^a-z0-9]/g, '');
    return n.length > 0 && (n === site.replace(/[^a-z0-9]/g, '') || host.replace(/\./g, '').includes(n));
  };
  const kept = parts.filter((p) => !isSiteName(p));
  if (kept.length === 0) return parts[0];
  return kept[0];
}

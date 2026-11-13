// Shields: Kite's ad and tracker blocker, plus the HTTPS-only rule.
// Pure logic lives here (and is tested); the main process does the blocking.

export interface Shields {
  /** Master switch. */
  enabled: boolean;
  /** Block ads (EasyList). */
  ads: boolean;
  /** Block trackers (EasyPrivacy). */
  trackers: boolean;
  /** Hide cookie-consent banners. */
  cookieBanners: boolean;
  /** Also hide the empty boxes ads leave behind. */
  cosmetic: boolean;
  /** Sites where nothing is blocked (hosts, without "www."). */
  allow: string[];
}

export function defaultShields(): Shields {
  return { enabled: true, ads: true, trackers: true, cookieBanners: false, cosmetic: true, allow: [] };
}

/** "https://www.Example.com/x" or "Example.com" → "example.com". Empty string if it isn't a site. */
export function siteKey(input: string): string {
  let h = String(input ?? '').trim().toLowerCase();
  if (!h) return '';
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(h)) h = new URL(h).hostname;
    else h = h.split('/')[0].split(':')[0];
  } catch {
    return '';
  }
  h = h.replace(/^www\./, '').replace(/\.$/, '');
  return /^[a-z0-9.-]+$/.test(h) && h.length <= 253 ? h : '';
}

export function sanitizeShields(v: unknown): Shields {
  const d = defaultShields();
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const bool = (k: keyof Shields) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (d[k] as boolean));
  const allow = Array.isArray(o.allow) ? [...new Set(o.allow.map((x) => (typeof x === 'string' ? siteKey(x) : '')).filter(Boolean))].slice(0, 500) : [];
  return { enabled: bool('enabled'), ads: bool('ads'), trackers: bool('trackers'), cookieBanners: bool('cookieBanners'), cosmetic: bool('cosmetic'), allow };
}

/** Is this site (or a parent domain of it) on the exceptions list? */
export function isAllowedSite(sh: Pick<Shields, 'allow'>, urlOrHost: string): boolean {
  const h = siteKey(urlOrHost);
  if (!h) return false;
  return sh.allow.some((a) => h === a || h.endsWith(`.${a}`));
}

/** Does Shields block things on this page? */
export function shieldsActive(sh: Shields, pageUrl: string): boolean {
  return sh.enabled && (sh.ads || sh.trackers || sh.cookieBanners) && !isAllowedSite(sh, pageUrl);
}

/** Turn blocking off (allow = true) or back on for one site. */
export function setSiteAllowed(sh: Shields, urlOrHost: string, allow: boolean): Shields {
  const h = siteKey(urlOrHost);
  if (!h) return sh;
  const rest = sh.allow.filter((a) => a !== h);
  return { ...sh, allow: allow ? [...rest, h].sort() : rest };
}

/** Which filter lists these choices need. */
export function shieldLists(sh: Shields): string[] {
  const out: string[] = [];
  if (sh.ads) out.push('https://easylist.to/easylist/easylist.txt');
  if (sh.trackers) out.push('https://easylist.to/easylist/easyprivacy.txt');
  if (sh.cookieBanners) out.push('https://secure.fanboy.co.nz/fanboy-cookiemonster.txt');
  return out;
}

/** A stable name for a set of choices, so a cached engine is reused only when it matches. */
export function shieldsKey(sh: Shields): string {
  return `${sh.ads ? 'a' : ''}${sh.trackers ? 't' : ''}${sh.cookieBanners ? 'c' : ''}` || 'none';
}

/**
 * A small list that ships inside Kite, used until the full lists have been
 * downloaded (and when you are offline). Same syntax as EasyList.
 */
export const BUILTIN_FILTERS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'google-analytics.com', 'googletagmanager.com',
  'googletagservices.com', 'amazon-adsystem.com', 'adnxs.com', 'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'scorecardresearch.com', 'quantserve.com', 'moatads.com',
  'adform.net', 'smartadserver.com', 'bidswitch.net', 'zedo.com', 'advertising.com', 'serving-sys.com', 'media.net', 'popads.net',
  'propellerads.com', 'hotjar.com', 'mixpanel.com', 'segment.io', 'fullstory.com', 'mouseflow.com', 'chartbeat.com', 'newrelic.com',
  'nr-data.net', 'bat.bing.com', 'connect.facebook.net', 'analytics.twitter.com', 'ads-twitter.com', 'analytics.tiktok.com',
  'ads.linkedin.com', 'ads.yahoo.com', 'yandex.ru/metrika', 'mc.yandex.ru', 'adroll.com', 'teads.tv', 'sharethrough.com', '3lift.com',
  'indexww.com', 'lijit.com', 'revcontent.com', 'mgid.com', 'exoclick.com', 'adcolony.com', 'branch.io', 'amplitude.com', 'clarity.ms',
]
  .map((d) => `||${d}^$third-party`)
  .concat(['##.adsbygoogle', '##ins.adsbygoogle', '##[id^="google_ads_iframe"]', '##[id^="div-gpt-ad"]', '##.ad-banner', '##.ad-container', '##a[href*="doubleclick.net"]'])
  .join('\n');

// ---- HTTPS-only ------------------------------------------------------------------

/** Hosts that are this computer or the local network: never upgraded. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.test') || h.endsWith('.internal') || !h.includes('.') ) return true;
  if (h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * The https:// address to use instead of this page address, or null to leave it alone.
 * `allowHttp` holds hosts you chose to open over http anyway.
 */
export function httpsUpgrade(url: string, httpsOnly: boolean, allowHttp: ReadonlySet<string>): string | null {
  if (!httpsOnly || !/^http:\/\//i.test(url)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (isLocalHost(u.hostname) || allowHttp.has(u.hostname.toLowerCase())) return null;
  if (u.port && u.port !== '80') return null; // an odd port rarely speaks https
  u.protocol = 'https:';
  u.port = '';
  return u.href;
}

// ---- What the address bar says about a page ---------------------------------------

export type SecurityLevel = 'secure' | 'insecure' | 'local' | 'internal' | 'broken';

export function securityLevel(url: string, certError = false): SecurityLevel {
  if (certError) return 'broken';
  if (/^https:/i.test(url)) return 'secure';
  if (/^http:/i.test(url)) {
    try {
      return isLocalHost(new URL(url).hostname) ? 'local' : 'insecure';
    } catch {
      return 'insecure';
    }
  }
  if (/^file:/i.test(url)) return 'local';
  return 'internal';
}

export const SECURITY_TEXT: Record<SecurityLevel, { title: string; detail: string }> = {
  secure: { title: 'Connection is secure', detail: 'What you send to this site is encrypted and can’t be read on the way.' },
  insecure: { title: 'Not secure', detail: 'This site doesn’t use encryption. Don’t type passwords or card numbers here.' },
  local: { title: 'On this computer or network', detail: 'This page comes from your own computer or local network.' },
  internal: { title: 'Kite page', detail: 'This is a page that belongs to Kite.' },
  broken: { title: 'Connection isn’t private', detail: 'This site’s security certificate isn’t valid, so Kite stopped loading it.' },
};

/** Readable reason for a page that failed to load (Chromium error codes). */
export function loadErrorText(code: number, desc: string): { title: string; detail: string; cert: boolean } {
  const cert = code <= -200 && code >= -299;
  if (cert) return { title: 'This connection isn’t private', detail: 'The site’s security certificate isn’t valid. Someone could be pretending to be this site, so Kite won’t open it.', cert };
  if (code === -105 || code === -137) return { title: 'Site not found', detail: 'Kite couldn’t find this address. Check it for typos.', cert };
  if (code === -106) return { title: 'You’re offline', detail: 'Connect to the internet and try again.', cert };
  if (code === -312) return { title: 'This address is blocked', detail: 'It uses a network port that browsers refuse to open, for safety.', cert };
  if (code === -102 || code === -101 || code === -100) return { title: 'The site refused to connect', detail: 'It may be down, or blocking this connection.', cert };
  if (code === -118 || code === -7) return { title: 'The site took too long to answer', detail: 'Try again in a moment.', cert };
  if (code === -107 || code === -113 || code === -110) return { title: 'Secure connection failed', detail: 'This site doesn’t support a secure (https) connection properly.', cert };
  return { title: 'This page didn’t load', detail: desc ? `${desc} (${code})` : `Error ${code}`, cert };
}

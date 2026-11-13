import { describe, expect, it } from 'vitest';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import {
  BUILTIN_FILTERS, defaultShields, httpsUpgrade, isAllowedSite, isLocalHost, loadErrorText, sanitizeShields, securityLevel, setSiteAllowed, shieldLists, shieldsActive, shieldsKey, siteKey,
} from '../../src/shared/shields';
import { loadState } from '../../src/shared/persistence';
import { createInitialState } from '../../src/shared/defaults';
import { updateSettings } from '../../src/shared/settings';

describe('shields: sites and exceptions', () => {
  it('reads a site from an address or a host', () => {
    expect(siteKey('https://www.Example.com/a?b')).toBe('example.com');
    expect(siteKey('news.example.com:8080/x')).toBe('news.example.com');
    expect(siteKey('not a site')).toBe('');
    expect(siteKey('')).toBe('');
  });

  it('an exception covers the site and its subdomains, not look-alikes', () => {
    const sh = setSiteAllowed(defaultShields(), 'https://www.example.com/page', true);
    expect(sh.allow).toEqual(['example.com']);
    expect(isAllowedSite(sh, 'https://example.com/')).toBe(true);
    expect(isAllowedSite(sh, 'https://shop.example.com/')).toBe(true);
    expect(isAllowedSite(sh, 'https://notexample.com/')).toBe(false);
    expect(isAllowedSite(sh, 'https://example.com.evil.io/')).toBe(false);
    expect(shieldsActive(sh, 'https://example.com/')).toBe(false);
    expect(shieldsActive(sh, 'https://other.org/')).toBe(true);
    expect(setSiteAllowed(sh, 'example.com', false).allow).toEqual([]);
  });

  it('is inactive when switched off or when nothing is chosen', () => {
    expect(shieldsActive({ ...defaultShields(), enabled: false }, 'https://a.com')).toBe(false);
    expect(shieldsActive({ ...defaultShields(), ads: false, trackers: false }, 'https://a.com')).toBe(false);
  });

  it('cleans up saved values', () => {
    const sh = sanitizeShields({ enabled: 'yes', ads: false, allow: ['HTTPS://WWW.A.com/x', 'a.com', 42, '<script>'] });
    expect(sh.enabled).toBe(true);
    expect(sh.ads).toBe(false);
    expect(sh.allow).toEqual(['a.com']);
    expect(sanitizeShields(null)).toEqual(defaultShields());
  });

  it('picks lists by choice and names the combination', () => {
    expect(shieldLists(defaultShields())).toHaveLength(2);
    expect(shieldLists({ ...defaultShields(), cookieBanners: true })).toHaveLength(3);
    expect(shieldsKey(defaultShields())).toBe('at');
    expect(shieldsKey({ ...defaultShields(), ads: false, trackers: false })).toBe('none');
  });

  it('old saved data gets Shields; settings changes are sanitised', () => {
    const raw = JSON.parse(JSON.stringify(createInitialState()));
    delete raw.settings.shields;
    delete raw.settings.motionSpeed;
    raw.settings.motionFeel = 'wobbly';
    const s = loadState(raw);
    expect(s.settings.shields).toEqual(defaultShields());
    expect(s.settings.motionSpeed).toBe(1);
    expect(s.settings.motionFeel).toBe('style');
    updateSettings(s, { motionSpeed: 9, shields: { ...defaultShields(), allow: ['B.com', 'b.com'] } });
    expect(s.settings.motionSpeed).toBe(2);
    expect(s.settings.shields.allow).toEqual(['b.com']);
  });
});

describe('shields: the built-in list really blocks', () => {
  const engine = FiltersEngine.parse(BUILTIN_FILTERS);
  const blocked = (url: string, sourceUrl: string, type = 'script') => engine.match(Request.fromRawDetails({ url, sourceUrl, type: type as never })).match;

  it('blocks well-known ad and tracker hosts on other sites', () => {
    expect(blocked('https://securepubads.g.doubleclick.net/tag/js/gpt.js', 'https://news.example.com/')).toBe(true);
    expect(blocked('https://www.google-analytics.com/analytics.js', 'https://news.example.com/')).toBe(true);
    expect(blocked('https://connect.facebook.net/en_US/fbevents.js', 'https://shop.example.com/')).toBe(true);
  });

  it('leaves ordinary requests alone', () => {
    expect(blocked('https://news.example.com/app.js', 'https://news.example.com/')).toBe(false);
    expect(blocked('https://cdn.jsdelivr.net/npm/react/index.js', 'https://news.example.com/')).toBe(false);
    expect(blocked('https://fonts.gstatic.com/s/inter.woff2', 'https://news.example.com/', 'font')).toBe(false);
  });

  it('does not break a company’s own site', () => {
    expect(blocked('https://www.hotjar.com/app.js', 'https://www.hotjar.com/')).toBe(false);
  });

  it('has cosmetic rules for leftover ad boxes', () => {
    const { styles } = engine.getCosmeticsFilters({ url: 'https://news.example.com/', hostname: 'news.example.com', domain: 'example.com', classes: ['adsbygoogle'], getInjectionRules: false });
    expect(styles).toContain('.adsbygoogle');
  });

  it('survives being saved and loaded again', () => {
    const again = FiltersEngine.deserialize(engine.serialize());
    expect(again.match(Request.fromRawDetails({ url: 'https://ad.doubleclick.net/x.js', sourceUrl: 'https://a.com/', type: 'script' as never })).match).toBe(true);
  });
});

describe('https-only', () => {
  const none = new Set<string>();
  it('upgrades ordinary sites', () => {
    expect(httpsUpgrade('http://example.com/a?b=1', true, none)).toBe('https://example.com/a?b=1');
    expect(httpsUpgrade('http://example.com:80/', true, none)).toBe('https://example.com/');
  });
  it('leaves local addresses, odd ports, exceptions and https alone', () => {
    for (const u of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://192.168.1.10/admin', 'http://10.0.0.2/', 'http://printer.local/', 'http://router/', 'http://[::1]:8080/', 'http://example.com:8080/'])
      expect(httpsUpgrade(u, true, none)).toBeNull();
    expect(httpsUpgrade('https://example.com/', true, none)).toBeNull();
    expect(httpsUpgrade('http://example.com/', false, none)).toBeNull();
    expect(httpsUpgrade('http://old.example.com/', true, new Set(['old.example.com']))).toBeNull();
  });
  it('knows local hosts', () => {
    expect(isLocalHost('172.20.1.1')).toBe(true);
    expect(isLocalHost('172.32.1.1')).toBe(false);
    expect(isLocalHost('8.8.8.8')).toBe(false);
    expect(isLocalHost('example.com')).toBe(false);
  });
});

describe('what the address bar says', () => {
  it('rates connections', () => {
    expect(securityLevel('https://a.com/')).toBe('secure');
    expect(securityLevel('http://a.com/')).toBe('insecure');
    expect(securityLevel('http://localhost:5173/')).toBe('local');
    expect(securityLevel('file:///Users/me/a.html')).toBe('local');
    expect(securityLevel('about:blank')).toBe('internal');
    expect(securityLevel('https://a.com/', true)).toBe('broken');
  });
  it('explains load failures; certificate problems are marked', () => {
    expect(loadErrorText(-202, 'ERR_CERT_AUTHORITY_INVALID').cert).toBe(true);
    expect(loadErrorText(-105, '').title).toBe('Site not found');
    expect(loadErrorText(-106, '').title).toBe('You’re offline');
    expect(loadErrorText(-999, 'ERR_WEIRD').detail).toContain('ERR_WEIRD');
    expect(loadErrorText(-105, '').cert).toBe(false);
  });
});

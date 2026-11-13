// Everything Kite does to network requests, for every cookie jar ("session"):
//  - Shields: block ads and trackers (EasyList-style rules), hide leftovers
//  - HTTPS-only: open sites over https when possible
//  - Global Privacy Control header
//  - notice videos and sounds a page loads, so they can be offered for download

import { net, type Session, type WebContents } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { BUILTIN_FILTERS, httpsUpgrade, isAllowedSite, shieldLists, shieldsActive, shieldsKey, type Shields } from '../shared/shields';
import { mediaKind, nameFromUrl, type MediaItem } from '../shared/downloads';
import type { Prefs, ShieldsStatus } from '../shared/ipc';

const REFRESH_MS = 4 * 24 * 60 * 60 * 1000;
const TYPES: Record<string, string> = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image', font: 'font', object: 'object',
  xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media', webSocket: 'websocket',
};

export interface NetworkDeps {
  dir: string;
  prefs(): Prefs;
  /** Is this a web page shown in a Kite tab (not Kite's own UI)? */
  isPage(wcId: number): boolean;
  /** Tell the UI how many things were blocked on a page. */
  onCount(wcId: number, count: number): void;
  onStatus(st: ShieldsStatus): void;
  log(msg: string): void;
}

export function createNetwork(deps: NetworkDeps) {
  mkdirSync(deps.dir, { recursive: true });
  let engine = FiltersEngine.parse(BUILTIN_FILTERS);
  let status: ShieldsStatus = { source: 'builtin', updatedAt: 0, updating: false };
  let loadedKey = '';
  let loading: Promise<void> | null = null;

  /** Pages you chose to open over http although HTTPS-only is on (until Kite quits). */
  const allowHttp = new Set<string>();
  const topUrl = new Map<number, string>();
  const counts = new Map<number, number>();
  const media = new Map<number, Map<string, MediaItem>>();
  const notify = new Map<number, ReturnType<typeof setTimeout>>();

  const setStatus = (p: Partial<ShieldsStatus>) => {
    status = { ...status, ...p };
    deps.onStatus(status);
  };

  const cacheFile = (key: string) => join(deps.dir, `shields-${key}.bin`);

  /** Use the full lists: from the saved copy if fresh, else download them (only when Shields are on). */
  async function ensureLists(force = false): Promise<void> {
    const sh = deps.prefs().shields;
    const key = shieldsKey(sh);
    const lists = shieldLists(sh);
    if (!sh.enabled || !lists.length) return;
    if (loading) return loading;
    const file = cacheFile(key);
    let age = Infinity;
    if (existsSync(file)) {
      age = Date.now() - statSync(file).mtimeMs;
      if (loadedKey !== key) {
        try {
          engine = FiltersEngine.deserialize(readFileSync(file));
          loadedKey = key;
          setStatus({ source: 'full', updatedAt: statSync(file).mtimeMs, error: undefined });
        } catch (err) {
          deps.log(`shields: saved lists unreadable (${(err as Error).message}), downloading again`);
          age = Infinity;
        }
      }
    }
    if (!force && age < REFRESH_MS && loadedKey === key) return;
    setStatus({ updating: true });
    loading = (async () => {
      try {
        const texts = await Promise.all(
          lists.map(async (u) => {
            const res = await net.fetch(u, { cache: 'no-store' });
            if (!res.ok) throw new Error(`${new URL(u).hostname} answered ${res.status}`);
            return res.text();
          }),
        );
        // The built-in rules stay in, so nothing regresses if a list changes.
        const next = FiltersEngine.parse(`${BUILTIN_FILTERS}\n${texts.join('\n')}`);
        writeFileSync(file, next.serialize());
        // Only swap if the choices didn't change while downloading.
        if (shieldsKey(deps.prefs().shields) === key) {
          engine = next;
          loadedKey = key;
        }
        setStatus({ source: 'full', updatedAt: Date.now(), updating: false, error: undefined });
      } catch (err) {
        deps.log(`shields: list download failed: ${(err as Error).message}`);
        setStatus({ updating: false, error: 'Couldn’t download the filter lists. Using the built-in list for now.' });
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function prefsChanged() {
    const sh = deps.prefs().shields;
    if (shieldsKey(sh) !== loadedKey && loadedKey) {
      // Different lists chosen: fall back to the built-in list until the right ones load.
      engine = FiltersEngine.parse(BUILTIN_FILTERS);
      loadedKey = '';
      setStatus({ source: 'builtin' });
    }
    void ensureLists();
  }

  function bump(wcId: number) {
    const n = (counts.get(wcId) ?? 0) + 1;
    counts.set(wcId, n);
    if (notify.has(wcId)) return;
    notify.set(
      wcId,
      setTimeout(() => {
        notify.delete(wcId);
        deps.onCount(wcId, counts.get(wcId) ?? 0);
      }, 300),
    );
  }

  function attach(ses: Session) {
    ses.webRequest.onBeforeRequest((details, cb) => {
      const { url, resourceType, webContentsId: wcId } = details;
      if (!/^(https?|wss?):/i.test(url)) return cb({});
      const prefs = deps.prefs();
      if (resourceType === 'mainFrame') {
        const up = httpsUpgrade(url, prefs.httpsOnly, allowHttp);
        if (wcId !== undefined) {
          topUrl.set(wcId, up ?? url);
          counts.set(wcId, 0);
          media.delete(wcId);
          deps.onCount(wcId, 0);
        }
        return cb(up ? { redirectURL: up } : {});
      }
      // Only pages in tabs are filtered: never Kite's own UI, extensions' own pages or background workers.
      if (wcId === undefined || !deps.isPage(wcId)) return cb({});
      const top = topUrl.get(wcId) ?? details.webContents?.getURL() ?? '';
      if (!shieldsActive(prefs.shields, top)) return cb({});
      try {
        const { match, redirect } = engine.match(Request.fromRawDetails({ url, sourceUrl: top || details.referrer, type: (TYPES[resourceType] ?? 'other') as never }));
        if (redirect?.dataUrl) {
          bump(wcId);
          return cb({ redirectURL: redirect.dataUrl });
        }
        if (match) {
          bump(wcId);
          return cb({ cancel: true });
        }
      } catch (err) {
        deps.log(`shields: match failed: ${(err as Error).message}`);
      }
      cb({});
    });

    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      if (!deps.prefs().sendGpc || !/^https?:/i.test(details.url)) return cb({});
      cb({ requestHeaders: { ...details.requestHeaders, 'Sec-GPC': '1', DNT: '1' } });
    });

    // Notice media as it loads (observing only — responses are never changed).
    ses.webRequest.onResponseStarted((details) => {
      const wcId = details.webContentsId;
      if (wcId === undefined || !deps.isPage(wcId) || details.statusCode >= 400) return;
      const h = details.responseHeaders ?? {};
      const header = (n: string) => Object.entries(h).find(([k]) => k.toLowerCase() === n)?.[1]?.[0] ?? '';
      const mime = header('content-type');
      const kind = mediaKind(mime, details.url);
      if (!kind || !/^https?:/i.test(details.url)) return;
      const size = Number(/\/(\d+)$/.exec(header('content-range'))?.[1] ?? header('content-length')) || 0;
      // Tiny clips are sound effects and UI noises, not what anyone wants to save.
      if (kind !== 'stream' && size > 0 && size < 150_000) return;
      let m = media.get(wcId);
      if (!m) media.set(wcId, (m = new Map()));
      if (m.size >= 40 && !m.has(details.url)) return;
      m.set(details.url, { url: details.url, kind, mime: mime.split(';')[0].trim(), size, label: nameFromUrl(details.url, kind) });
    });
  }

  /** Hide what blocked ads leave behind (and cookie banners, when chosen). */
  async function applyCosmetics(wc: WebContents) {
    const sh: Shields = deps.prefs().shields;
    const url = wc.getURL();
    if (!sh.cosmetic || !/^https?:/i.test(url) || !shieldsActive(sh, url)) return;
    const pass = async (base: boolean) => {
      if (wc.isDestroyed() || wc.getURL() !== url) return;
      const seen = (await wc
        .executeJavaScriptInIsolatedWorld(1998, [
          {
            code: `(() => { const c = new Set(), i = new Set(); for (const e of document.querySelectorAll('[class],[id]')) { if (e.id) i.add(e.id); for (const k of e.classList) c.add(k); if (c.size > 6000) break; } return { classes: [...c], ids: [...i].slice(0, 3000) }; })()`,
          },
        ])
        .catch(() => null)) as { classes: string[]; ids: string[] } | null;
      const r = Request.fromRawDetails({ url, type: 'main_frame' as never });
      const { styles } = engine.getCosmeticsFilters({
        url,
        hostname: r.hostname,
        domain: r.domain,
        classes: seen?.classes,
        ids: seen?.ids,
        getBaseRules: base,
        getRulesFromHostname: base,
        getRulesFromDOM: true,
        getInjectionRules: false,
        getExtendedRules: false,
      });
      if (styles && !wc.isDestroyed()) await wc.insertCSS(styles, { cssOrigin: 'user' }).catch(() => undefined);
    };
    try {
      await pass(true);
      // Many pages add their ad boxes a moment after loading.
      setTimeout(() => void pass(false).catch(() => undefined), 2500);
    } catch (err) {
      deps.log(`shields: cosmetics failed: ${(err as Error).message}`);
    }
  }

  function forget(wcId: number) {
    topUrl.delete(wcId);
    counts.delete(wcId);
    media.delete(wcId);
    const t = notify.get(wcId);
    if (t) clearTimeout(t);
    notify.delete(wcId);
  }

  return {
    attach,
    applyCosmetics,
    forget,
    prefsChanged,
    refresh: () => ensureLists(true),
    status: () => status,
    count: (wcId: number) => counts.get(wcId) ?? 0,
    media: (wcId: number) => [...(media.get(wcId)?.values() ?? [])],
    allowHttp: (host: string) => void allowHttp.add(host.toLowerCase()),
    isAllowed: (url: string) => isAllowedSite(deps.prefs().shields, url),
  };
}

export type Network = ReturnType<typeof createNetwork>;

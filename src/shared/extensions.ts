// Chrome extensions: reading a manifest, explaining what it asks for, and
// being honest about what Kite's engine (Electron) can and can't run.
// Pure and tested; the main process unpacks and loads them.

export interface ExtensionSummary {
  name: string;
  version: string;
  description: string;
  manifestVersion: number;
  /** Plain-language lines: what the extension will be able to do. */
  access: string[];
  /** Sites it can read and change ("All websites" or a list of hosts). */
  sites: string[];
  /** Things it uses that Kite can't provide, so parts of it may not work. */
  limits: string[];
  hasPopup: boolean;
  hasOptions: boolean;
}

export interface ExtensionInfo extends ExtensionSummary {
  /** Kite's id for it (its folder name). */
  id: string;
  enabled: boolean;
  /** Where it came from. */
  source: 'folder' | 'file' | 'store';
  /** The Chrome Web Store id, when installed from there. */
  storeId?: string;
  installedAt: number;
  /** Set when it failed to load. */
  error?: string;
}

/** A pending install waiting for the user's yes. */
export interface ExtensionPreview extends ExtensionSummary {
  token: string;
  source: ExtensionInfo['source'];
}

/** What Electron's extension support covers. Shown in Settings. */
export const ENGINE_SUPPORT = {
  works: [
    'Content scripts and styles that change pages',
    'Background service workers (Manifest V3) and background pages (V2)',
    'chrome.runtime messaging, chrome.storage, chrome.i18n, chrome.extension',
    'chrome.webRequest (read and block requests)',
    'chrome.scripting and chrome.tabs basics (run scripts, send messages, reload)',
    'Popup and options pages, opened from Settings → Extensions',
    'Developer-tools panels',
  ],
  missing: [
    'Toolbar buttons and badges in Kite’s own interface (chrome.action / browserAction)',
    'chrome.tabs and chrome.windows for managing tabs and windows (create, move, group)',
    'chrome.contextMenus, chrome.notifications, chrome.downloads, chrome.bookmarks, chrome.history, chrome.cookies',
    'chrome.declarativeNetRequest (so most ad-blocking extensions don’t block; use Kite’s Shields instead)',
    'chrome.identity sign-in, chrome.sidePanel, native messaging',
    'Automatic updates from the Chrome Web Store (reinstall to update)',
  ],
} as const;

const API_TEXT: Record<string, string> = {
  tabs: 'See the addresses and titles of your open pages',
  activeTab: 'Read and change the page you’re on when you use it',
  scripting: 'Run its code inside pages',
  webRequest: 'See your network requests',
  webRequestBlocking: 'Block or change network requests',
  storage: 'Save its own settings',
  cookies: 'Read and change cookies',
  history: 'Read your browsing history',
  bookmarks: 'Read and change bookmarks',
  downloads: 'Manage downloads',
  clipboardRead: 'Read your clipboard',
  clipboardWrite: 'Write to your clipboard',
  notifications: 'Show notifications',
  geolocation: 'Know your location',
  nativeMessaging: 'Talk to other apps on this computer',
  proxy: 'Control your network proxy',
  management: 'Manage other extensions',
  debugger: 'Debug and control pages',
  privacy: 'Change privacy settings',
};

/** APIs Electron does not provide (requests for these are noted as limits). */
const UNSUPPORTED: Record<string, string> = {
  contextMenus: 'right-click menu items',
  notifications: 'notifications',
  downloads: 'managing downloads',
  bookmarks: 'bookmarks',
  history: 'history',
  cookies: 'the cookies API',
  declarativeNetRequest: 'request blocking rules (declarativeNetRequest)',
  declarativeNetRequestWithHostAccess: 'request blocking rules (declarativeNetRequest)',
  identity: 'account sign-in',
  sidePanel: 'a side panel',
  nativeMessaging: 'talking to other apps',
  tabGroups: 'tab groups',
  windows: 'managing windows',
  proxy: 'proxy settings',
  debugger: 'the debugger',
  offscreen: 'offscreen documents',
  alarms: 'alarms (timers)',
  commands: 'keyboard shortcuts',
  omnibox: 'address-bar keywords',
  topSites: 'top sites',
  sessions: 'sessions',
  privacy: 'privacy settings',
  browsingData: 'clearing browsing data',
  search: 'the search API',
  tts: 'text to speech',
};

const ALL_SITES = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|file:\/\/\/\*)$/;

function hostOfPattern(p: string): string {
  const m = /^(?:\*|https?|wss?|ftp):\/\/([^/]+)\//.exec(p);
  return m ? m[1].replace(/^\*\./, '') : '';
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Read a manifest.json. Throws with a readable message if it isn't a usable
 * extension. `messages` is the default locale's messages.json (for "__MSG_name__").
 */
export function summarizeManifest(manifest: unknown, messages?: unknown): ExtensionSummary {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('This isn’t a Chrome extension (no readable manifest.json).');
  const m = manifest as Record<string, unknown>;
  const mv = Number(m.manifest_version);
  if (mv !== 2 && mv !== 3) throw new Error('This extension’s manifest version isn’t supported (needs 2 or 3).');
  const msg = (v: unknown, max?: number) => {
    const s = str(v, max);
    const k = /^__MSG_(.+)__$/.exec(s)?.[1];
    if (!k || !messages || typeof messages !== 'object') return s;
    const hit = Object.entries(messages as Record<string, { message?: unknown }>).find(([key]) => key.toLowerCase() === k.toLowerCase());
    return str(hit?.[1]?.message, max) || s;
  };
  const name = msg(m.name, 80);
  const version = str(m.version, 40);
  if (!name || !version) throw new Error('This extension has no name or version.');
  if (m.theme && !m.background && !m.content_scripts) throw new Error('This is a Chrome theme, not an extension. Kite has its own themes in Settings → Appearance.');
  if (m.app) throw new Error('This is a Chrome app, not an extension. Chrome apps can’t run in Kite.');

  const perms = [...strs(m.permissions), ...strs(m.optional_permissions)];
  const hostPatterns = [...strs(m.host_permissions), ...strs(m.optional_host_permissions), ...perms.filter((p) => p.includes('://') || p === '<all_urls>')];
  const scripts = Array.isArray(m.content_scripts) ? (m.content_scripts as { matches?: unknown }[]) : [];
  for (const cs of scripts) hostPatterns.push(...strs(cs?.matches));
  const all = hostPatterns.some((p) => ALL_SITES.test(p));
  const hosts = [...new Set(hostPatterns.map(hostOfPattern).filter((h) => h && h !== '*'))].sort();
  const sites = all ? ['All websites'] : hosts.slice(0, 40);

  const apis = [...new Set(perms.filter((p) => !p.includes('://') && p !== '<all_urls>'))];
  const access = apis.map((p) => API_TEXT[p]).filter(Boolean);
  if (sites.length) access.unshift(all ? 'Read and change everything on every website you visit' : `Read and change pages on ${hosts.length} site${hosts.length === 1 ? '' : 's'}`);

  const limits = [...new Set(apis.map((p) => UNSUPPORTED[p]).filter(Boolean))].map((t) => `Uses ${t}, which Kite can’t provide`);
  const action = (m.action ?? m.browser_action ?? m.page_action) as { default_popup?: unknown } | undefined;
  if (action) limits.unshift('Its toolbar button isn’t shown; open its popup from Settings → Extensions');
  if (m.chrome_url_overrides) limits.push('Replacing the new-tab page isn’t supported');
  if (m.devtools_page === undefined && !scripts.length && !m.background && !action) limits.push('It has nothing Kite can run');

  return {
    name,
    version,
    description: msg(m.description, 300),
    manifestVersion: mv,
    access: [...new Set(access)],
    sites,
    limits,
    hasPopup: !!str(action?.default_popup),
    hasOptions: !!(str((m.options_ui as { page?: unknown } | undefined)?.page) || str(m.options_page)),
  };
}

/** Paths (inside the extension) of its popup and options pages. */
export function extensionPages(manifest: unknown): { popup: string; options: string } {
  const m = (manifest ?? {}) as Record<string, unknown>;
  const action = (m.action ?? m.browser_action ?? m.page_action) as { default_popup?: unknown } | undefined;
  const clean = (p: string) => (p && !/^[a-z]+:/i.test(p) && !p.includes('..') ? p.replace(/^\/+/, '') : '');
  return { popup: clean(str(action?.default_popup)), options: clean(str((m.options_ui as { page?: unknown } | undefined)?.page) || str(m.options_page)) };
}

/** A Chrome Web Store id from an id or a store link ('' if neither). */
export function webStoreId(input: string): string {
  const s = String(input ?? '').trim();
  if (/^[a-p]{32}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (!/^(chromewebstore\.google\.com|chrome\.google\.com)$/.test(u.hostname)) return '';
    return u.pathname.split('/').find((p) => /^[a-p]{32}$/.test(p)) ?? '';
  } catch {
    return '';
  }
}

/** Where Chrome itself downloads an extension package from. */
export function webStoreCrxUrl(id: string, chromeVersion: string): string {
  const x = encodeURIComponent(`id=${id}&installsource=ondemand&uc`);
  return `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${encodeURIComponent(chromeVersion)}&x=${x}`;
}

/**
 * A .crx file is a zip with a signed header in front. Returns where the zip
 * starts (0 for a plain zip). Throws if the file is neither.
 */
export function crxZipOffset(buf: Uint8Array): number {
  const u32 = (o: number) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  if (buf.length < 16) throw new Error('This file is too small to be an extension.');
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 0; // "PK": a plain zip
  if (!(buf[0] === 0x43 && buf[1] === 0x72 && buf[2] === 0x32 && buf[3] === 0x34)) throw new Error('This file isn’t a Chrome extension (.crx or .zip).');
  const version = u32(4);
  const off = version === 2 ? 16 + u32(8) + u32(12) : version === 3 ? 12 + u32(8) : -1;
  if (off < 0 || off >= buf.length || buf[off] !== 0x50 || buf[off + 1] !== 0x4b) throw new Error('This extension file is damaged.');
  return off;
}

/** A path from inside an archive, made safe to write under a folder ('' = skip it). */
export function safeArchivePath(p: string): string {
  const parts = String(p).replace(/\\/g, '/').split('/').filter((x) => x && x !== '.');
  if (!parts.length || parts.some((x) => x === '..' || /[\u0000-\u001f:]/.test(x)) || /^[A-Za-z]:/.test(p) || p.startsWith('/')) return '';
  if (parts[0] === '_metadata') return ''; // Chrome's own signatures; Electron refuses folders that start with "_"
  return parts.join('/');
}

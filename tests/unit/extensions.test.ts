import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { crxZipOffset, extensionPages, safeArchivePath, summarizeManifest, webStoreCrxUrl, webStoreId } from '../../src/shared/extensions';
import { partitionForSpace, partitionForTab, isKitePartition, orphanPartitions, DEFAULT_PARTITION } from '../../src/shared/profiles';
import { createInitialState } from '../../src/shared/defaults';
import { createSpace, updateSpace } from '../../src/shared/spaces';
import { loadState } from '../../src/shared/persistence';
import * as ops from '../../src/shared/ops';

describe('reading an extension', () => {
  const mv3 = {
    manifest_version: 3,
    name: '__MSG_appName__',
    version: '1.2.3',
    description: 'Makes pages dark',
    default_locale: 'en',
    permissions: ['storage', 'tabs', 'contextMenus', 'declarativeNetRequest'],
    host_permissions: ['<all_urls>'],
    action: { default_popup: 'popup.html' },
    options_ui: { page: 'options.html' },
    background: { service_worker: 'sw.js' },
    content_scripts: [{ matches: ['https://*.example.com/*'], js: ['c.js'] }],
  };

  it('explains access in plain words and names what Kite cannot run', () => {
    const s = summarizeManifest(mv3, { appname: { message: 'Night Mode' } });
    expect(s.name).toBe('Night Mode');
    expect(s.manifestVersion).toBe(3);
    expect(s.sites).toEqual(['All websites']);
    expect(s.access[0]).toContain('every website');
    expect(s.access).toContain('See the addresses and titles of your open pages');
    expect(s.limits.some((l) => l.includes('toolbar button'))).toBe(true);
    expect(s.limits.some((l) => l.includes('declarativeNetRequest'))).toBe(true);
    expect(s.limits.some((l) => l.includes('right-click'))).toBe(true);
    expect(s.hasPopup && s.hasOptions).toBe(true);
  });

  it('lists the sites of a narrow extension', () => {
    const s = summarizeManifest({ manifest_version: 2, name: 'Tidy', version: '1', content_scripts: [{ matches: ['https://*.example.com/*', 'https://news.site.org/*'], js: ['a.js'] }] });
    expect(s.sites).toEqual(['example.com', 'news.site.org']);
    expect(s.access[0]).toBe('Read and change pages on 2 sites');
    expect(s.limits).toEqual([]);
  });

  it('refuses things that are not extensions', () => {
    expect(() => summarizeManifest(null)).toThrow(/manifest/);
    expect(() => summarizeManifest({ manifest_version: 1, name: 'Old', version: '1' })).toThrow(/version/);
    expect(() => summarizeManifest({ manifest_version: 3, version: '1' })).toThrow(/name/);
    expect(() => summarizeManifest({ manifest_version: 3, name: 'T', version: '1', theme: {} })).toThrow(/theme/);
    expect(() => summarizeManifest({ manifest_version: 2, name: 'A', version: '1', app: {} })).toThrow(/app/);
  });

  it('only opens pages that live inside the extension', () => {
    expect(extensionPages(mv3)).toEqual({ popup: 'popup.html', options: 'options.html' });
    expect(extensionPages({ action: { default_popup: 'https://evil.com/p.html' }, options_page: '../../secret.html' })).toEqual({ popup: '', options: '' });
  });

  it('finds a Web Store id in an id or a store link only', () => {
    const id = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';
    expect(webStoreId(id)).toBe(id);
    expect(webStoreId(`https://chromewebstore.google.com/detail/ublock-origin/${id}?hl=en`)).toBe(id);
    expect(webStoreId(`https://chrome.google.com/webstore/detail/x/${id}`)).toBe(id);
    expect(webStoreId(`https://evil.example.com/detail/x/${id}`)).toBe('');
    expect(webStoreId('hello')).toBe('');
    expect(webStoreCrxUrl(id, '140.0.0.0')).toContain(`id%3D${id}`);
  });
});

describe('extension packages', () => {
  const zip = zipSync({ 'manifest.json': strToU8('{}') });
  it('finds the zip inside a .crx (version 3 and 2) and accepts a plain zip', () => {
    expect(crxZipOffset(zip)).toBe(0);
    const header = new Uint8Array(20);
    const crx3 = new Uint8Array([0x43, 0x72, 0x32, 0x34, 3, 0, 0, 0, 20, 0, 0, 0, ...header, ...zip]);
    expect(crxZipOffset(crx3)).toBe(32);
    const crx2 = new Uint8Array([0x43, 0x72, 0x32, 0x34, 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0, ...new Uint8Array(10), ...zip]);
    expect(crxZipOffset(crx2)).toBe(26);
  });
  it('refuses damaged or unrelated files', () => {
    expect(() => crxZipOffset(new Uint8Array(4))).toThrow(/small/);
    expect(() => crxZipOffset(new Uint8Array(64).fill(7))).toThrow(/isn’t a Chrome extension/);
    expect(() => crxZipOffset(new Uint8Array([0x43, 0x72, 0x32, 0x34, 3, 0, 0, 0, 255, 255, 0, 0, ...new Uint8Array(20)]))).toThrow(/damaged/);
  });
  it('never unpacks outside its folder', () => {
    expect(safeArchivePath('js/app.js')).toBe('js/app.js');
    expect(safeArchivePath('./a/./b.css')).toBe('a/b.css');
    for (const p of ['../evil.sh', 'a/../../b', '/etc/passwd', 'C:\\Windows\\x.dll', '..\\..\\x', '_metadata/verified_contents.json', '']) expect(safeArchivePath(p), p).toBe('');
  });
});

describe('Spaces with separate logins', () => {
  it('a normal Space shares the jar; an isolated one gets its own', () => {
    const s = createInitialState();
    const home = s.spaces[0];
    const work = createSpace(s, { name: 'Work' });
    updateSpace(s, work, { isolated: true });
    const w = s.spaces.find((x) => x.id === work)!;
    expect(partitionForSpace(home)).toBe(DEFAULT_PARTITION);
    expect(partitionForSpace(w)).toMatch(/^persist:kite-space-/);
    expect(isKitePartition(partitionForSpace(w))).toBe(true);
    expect(partitionForSpace(w)).not.toBe(partitionForSpace({ id: 'space_other', isolated: true }));
  });

  it('tabs follow their Space; Favorites and split panes are handled', () => {
    const s = createInitialState();
    const home = s.spaces[0].id;
    const a = ops.newTab(s, { url: 'https://mail.example.com', now: 1 });
    const work = createSpace(s, { name: 'Work' });
    updateSpace(s, work, { isolated: true });
    const b = ops.newTab(s, { url: 'https://mail.example.com', now: 2, spaceId: work });
    const jar = partitionForSpace(s.spaces.find((x) => x.id === work)!);
    expect(partitionForTab(s, a)).toBe(DEFAULT_PARTITION);
    expect(partitionForTab(s, b)).toBe(jar);
    expect(partitionForTab(s, 'missing')).toBe(DEFAULT_PARTITION);
    // The same tab moved to Favorites uses the shared jar: Favorites show in every Space.
    ops.addFavorite(s, b);
    expect(partitionForTab(s, b)).toBe(DEFAULT_PARTITION);
    // Turning isolation off puts the Space back on the shared jar.
    const c = ops.newTab(s, { url: 'https://c.example.com', now: 3, spaceId: work });
    expect(partitionForTab(s, c)).toBe(jar);
    updateSpace(s, work, { isolated: false });
    expect(partitionForTab(s, c)).toBe(DEFAULT_PARTITION);
    expect(s.spaces.find((x) => x.id === home)!.isolated).toBeUndefined();
  });

  it('only Kite’s own jars are accepted, and unused ones are found', () => {
    for (const p of ['persist:kite', 'persist:kite-space-space_abc-1']) expect(isKitePartition(p)).toBe(true);
    for (const p of ['', 'persist:other', 'kite', 'persist:kite-space-', 'persist:kite-space-a/b', 'persist:kite-space-../x', undefined, 5]) expect(isKitePartition(p)).toBe(false);
    const s = createInitialState();
    const work = createSpace(s, { name: 'Work' });
    updateSpace(s, work, { isolated: true });
    const jar = partitionForSpace(s.spaces[1]);
    expect(orphanPartitions(s, [DEFAULT_PARTITION, jar, 'persist:kite-space-gone', 'persist:other'])).toEqual(['persist:kite-space-gone']);
  });

  it('isolation survives saving and loading; junk values do not turn it on', () => {
    const s = createInitialState();
    updateSpace(s, s.spaces[0].id, { isolated: true });
    const again = loadState(JSON.parse(JSON.stringify(s)));
    expect(again.spaces[0].isolated).toBe(true);
    const raw = JSON.parse(JSON.stringify(s));
    raw.spaces[0].isolated = 'yes';
    expect(loadState(raw).spaces[0].isolated).toBeUndefined();
  });
});

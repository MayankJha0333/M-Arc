// Chrome extensions: install (folder, .crx/.zip file, or Chrome Web Store),
// show what they ask for, load them into every cookie jar, turn on/off, remove.
//
// Kite runs on Electron, which supports part of Chrome's extension platform —
// see ENGINE_SUPPORT in shared/extensions.ts for the honest list.

import { BrowserWindow, net, type Session } from 'electron';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { crxZipOffset, extensionPages, safeArchivePath, summarizeManifest, webStoreCrxUrl, webStoreId, type ExtensionInfo, type ExtensionPreview } from '../shared/extensions';

const MAX_PACKED = 80 * 1024 * 1024;
const MAX_UNPACKED = 300 * 1024 * 1024;
const MAX_FILES = 8000;

interface Saved {
  id: string;
  enabled: boolean;
  source: ExtensionInfo['source'];
  storeId?: string;
  installedAt: number;
}

export interface ExtensionDeps {
  dir: string;
  sessions(): Session[];
  defaultSession(): Session;
  /** Open windows without taking focus (background test runs). */
  quiet(): boolean;
  /** A web link clicked inside an extension's popup or options page. */
  openUrl(url: string): void;
  onChange(list: ExtensionInfo[]): void;
  log(msg: string): void;
}

export function createExtensions(deps: ExtensionDeps) {
  const root = join(deps.dir, 'extensions');
  const staging = join(root, '.staging');
  const stateFile = join(root, 'extensions.json');
  mkdirSync(root, { recursive: true });
  rmSync(staging, { recursive: true, force: true }); // installs abandoned last time

  let saved: Saved[] = [];
  try {
    const raw = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (Array.isArray(raw)) saved = raw.filter((x) => x && typeof x.id === 'string' && /^[a-z0-9-]{4,64}$/.test(x.id) && existsSync(join(root, x.id, 'manifest.json')));
  } catch {
    /* none installed */
  }
  const errors = new Map<string, string>();
  /** Kite id → Electron's id for it (the same in every session, since it comes from the folder). */
  const engineIds = new Map<string, string>();
  const pending = new Map<string, { dir: string; source: ExtensionInfo['source']; storeId?: string }>();

  const pathOf = (id: string) => join(root, id);
  const save = () => writeFileSync(stateFile, JSON.stringify(saved));

  function readManifest(dir: string) {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    let messages: unknown;
    const loc = typeof manifest.default_locale === 'string' ? manifest.default_locale.replace(/[^A-Za-z_-]/g, '') : '';
    if (loc) {
      try {
        messages = JSON.parse(readFileSync(join(dir, '_locales', loc, 'messages.json'), 'utf8'));
      } catch {
        /* names stay as written */
      }
    }
    return { manifest, summary: summarizeManifest(manifest, messages) };
  }

  function list(): ExtensionInfo[] {
    return saved.map((s) => {
      try {
        return { ...readManifest(pathOf(s.id)).summary, ...s, error: errors.get(s.id) };
      } catch (err) {
        return { ...s, name: s.id, version: '', description: '', manifestVersion: 0, access: [], sites: [], limits: [], hasPopup: false, hasOptions: false, error: (err as Error).message };
      }
    });
  }
  const changed = () => deps.onChange(list());

  async function loadInto(ses: Session, id: string) {
    try {
      const ext = await ses.extensions.loadExtension(pathOf(id), { allowFileAccess: false });
      engineIds.set(id, ext.id);
      errors.delete(id);
    } catch (err) {
      errors.set(id, (err as Error).message.replace(/^.*?Error: /, '').slice(0, 300));
      deps.log(`extensions: ${id} failed to load: ${(err as Error).message}`);
    }
  }

  function unloadFrom(ses: Session, id: string) {
    const eid = engineIds.get(id) ?? ses.extensions.getAllExtensions().find((e) => resolve(e.path) === resolve(pathOf(id)))?.id;
    if (eid && ses.extensions.getExtension(eid)) ses.extensions.removeExtension(eid);
  }

  /** A new cookie jar: give it every extension that is turned on. */
  async function attach(ses: Session) {
    for (const s of saved) if (s.enabled) await loadInto(ses, s.id);
    changed();
  }

  // ---- installing ---------------------------------------------------------------

  function stage(source: ExtensionInfo['source'], fill: (dir: string) => void, storeId?: string): ExtensionPreview {
    const token = randomBytes(12).toString('hex');
    const dir = join(staging, token);
    mkdirSync(dir, { recursive: true });
    try {
      fill(dir);
      if (!existsSync(join(dir, 'manifest.json'))) throw new Error('This isn’t a Chrome extension (no manifest.json at the top).');
      const { summary } = readManifest(dir);
      pending.set(token, { dir, source, storeId });
      return { ...summary, token, source };
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      throw err instanceof SyntaxError ? new Error('This extension’s manifest.json can’t be read.') : err;
    }
  }

  function unpack(buf: Uint8Array, dir: string) {
    if (buf.length > MAX_PACKED) throw new Error('This extension file is too large.');
    const files = unzipSync(buf.subarray(crxZipOffset(buf)));
    const names = Object.keys(files);
    if (names.length > MAX_FILES) throw new Error('This extension has too many files.');
    let total = 0;
    for (const name of names) {
      if (name.endsWith('/')) continue;
      const rel = safeArchivePath(name);
      if (!rel) continue;
      const dest = resolve(dir, rel);
      if (!dest.startsWith(resolve(dir) + sep)) continue; // never write outside the folder
      total += files[name].length;
      if (total > MAX_UNPACKED) throw new Error('This extension is too large when unpacked.');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, files[name]);
    }
  }

  const previewFile = (path: string) => stage('file', (dir) => unpack(readFileSync(path), dir));

  function previewFolder(path: string) {
    if (!existsSync(join(path, 'manifest.json'))) throw new Error('That folder has no manifest.json, so it isn’t an unpacked extension.');
    let count = 0;
    return stage('folder', (dir) =>
      cpSync(path, dir, {
        recursive: true,
        dereference: false,
        filter: (src) => {
          const base = src.split(/[\\/]/).pop() ?? '';
          if (base === '.git' || base === 'node_modules' || base === '_metadata' || statSync(src, { throwIfNoEntry: false })?.isSymbolicLink()) return false;
          if (++count > MAX_FILES) throw new Error('That folder has too many files.');
          return true;
        },
      }),
    );
  }

  async function previewStore(input: string): Promise<ExtensionPreview> {
    const id = webStoreId(input);
    if (!id) throw new Error('Paste a Chrome Web Store link or an extension id.');
    const res = await net.fetch(webStoreCrxUrl(id, process.versions.chrome), { cache: 'no-store' });
    if (res.status === 204 || res.status === 404) throw new Error('The Chrome Web Store has no extension with that id (or it isn’t offered for this browser version).');
    if (!res.ok) throw new Error(`The Chrome Web Store answered ${res.status}.`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return stage('store', (dir) => unpack(buf, dir), id);
  }

  function cancel(token: string) {
    const p = pending.get(token);
    if (!p) return;
    pending.delete(token);
    rmSync(p.dir, { recursive: true, force: true });
  }

  async function confirm(token: string): Promise<void> {
    const p = pending.get(token);
    if (!p) throw new Error('That install is no longer waiting.');
    pending.delete(token);
    const id = p.storeId ?? `x-${randomBytes(8).toString('hex')}`;
    // Installing over an older copy replaces it (this is also how you update).
    if (saved.some((s) => s.id === id)) await remove(id);
    renameSync(p.dir, pathOf(id));
    saved.push({ id, enabled: true, source: p.source, storeId: p.storeId, installedAt: Date.now() });
    save();
    for (const ses of deps.sessions()) await loadInto(ses, id);
    changed();
  }

  async function setEnabled(id: string, enabled: boolean) {
    const s = saved.find((x) => x.id === id);
    if (!s || s.enabled === enabled) return;
    s.enabled = enabled;
    save();
    for (const ses of deps.sessions()) {
      if (enabled) await loadInto(ses, id);
      else unloadFrom(ses, id);
    }
    if (!enabled) errors.delete(id);
    changed();
  }

  async function remove(id: string) {
    if (!saved.some((x) => x.id === id)) return;
    for (const ses of deps.sessions()) unloadFrom(ses, id);
    const eid = engineIds.get(id);
    saved = saved.filter((x) => x.id !== id);
    engineIds.delete(id);
    errors.delete(id);
    save();
    rmSync(pathOf(id), { recursive: true, force: true });
    // Its saved data goes too.
    if (eid) for (const ses of deps.sessions()) await ses.clearStorageData({ origin: `chrome-extension://${eid}` }).catch(() => undefined);
    changed();
  }

  /** Open an extension's popup or options page in a small window of its own. */
  function openPage(id: string, which: 'popup' | 'options') {
    const s = saved.find((x) => x.id === id);
    const eid = engineIds.get(id);
    if (!s?.enabled || !eid) return false;
    const page = extensionPages(readManifest(pathOf(id)).manifest)[which];
    if (!page) return false;
    const win = new BrowserWindow({
      width: which === 'popup' ? 420 : 760,
      height: which === 'popup' ? 600 : 640,
      title: list().find((x) => x.id === id)?.name ?? 'Extension',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { session: deps.defaultSession(), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    // The window stays on the extension's own pages; web links open as tabs.
    const stay = (url: string) => url.startsWith(`chrome-extension://${eid}/`);
    win.webContents.on('will-navigate', (e, url) => {
      if (stay(url)) return;
      e.preventDefault();
      if (/^https?:/i.test(url)) deps.openUrl(url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) deps.openUrl(url);
      return { action: 'deny' };
    });
    win.once('ready-to-show', () => (deps.quiet() ? win.showInactive() : win.show()));
    void win.loadURL(`chrome-extension://${eid}/${page}`);
    return true;
  }

  /** Leftover folders from extensions that are no longer listed. */
  for (const name of readdirSync(root)) {
    if (name === 'extensions.json' || name === '.staging' || saved.some((s) => s.id === name)) continue;
    rmSync(join(root, name), { recursive: true, force: true });
  }

  return { attach, list, previewFile, previewFolder, previewStore, confirm, cancel, setEnabled, remove, openPage };
}

export type Extensions = ReturnType<typeof createExtensions>;

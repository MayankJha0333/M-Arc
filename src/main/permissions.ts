// Site permissions: websites must ask before using the camera, microphone,
// location, notifications… "Always allow" and "Always block" are remembered in
// a file and can be reviewed and removed in Settings → Privacy & Security.

import { dialog, type BrowserWindow, type Session, type WebContents } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostOf } from '../shared/url';
import type { SitePermission } from '../shared/ipc';

const ALWAYS_OK = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management']);
export const PERMISSION_LABELS: Record<string, string> = {
  media: 'use your camera or microphone',
  geolocation: 'know your location',
  notifications: 'show notifications',
  'clipboard-read': 'read your clipboard',
  midi: 'use MIDI devices',
  midiSysex: 'use MIDI devices',
  'display-capture': 'record your screen',
  idleDetection: 'know when you’re idle',
  hid: 'use connected devices',
  serial: 'use serial devices',
  usb: 'use USB devices',
  'storage-access': 'use its saved data on other sites',
  'top-level-storage-access': 'use its saved data on other sites',
};

export interface PermissionDeps {
  dir: string;
  windowFor(wc: WebContents): BrowserWindow | undefined;
  onChange(list: SitePermission[]): void;
}

export function createPermissions(deps: PermissionDeps) {
  const file = join(deps.dir, 'permissions.json');
  /** "site|permission" → allowed? Saved to disk. */
  let saved: Record<string, boolean> = {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (typeof v === 'boolean' && PERMISSION_LABELS[k.split('|')[1]]) saved[k] = v;
  } catch {
    /* nothing remembered yet */
  }
  /** "Allow once" / "Don't allow" answers, kept until Kite quits. */
  const once = new Map<string, boolean>();
  /** One question at a time per site and permission. */
  const asking = new Map<string, Promise<boolean>>();

  const list = (): SitePermission[] =>
    Object.entries(saved)
      .map(([k, allowed]) => ({ site: k.split('|')[0], permission: k.split('|')[1], label: PERMISSION_LABELS[k.split('|')[1]] ?? k.split('|')[1], allowed }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.permission.localeCompare(b.permission));

  function persist() {
    writeFileSync(file, JSON.stringify(saved));
    deps.onChange(list());
  }

  async function ask(wc: WebContents, site: string, permission: string, label: string): Promise<boolean> {
    const key = `${site}|${permission}`;
    const win = deps.windowFor(wc);
    const opts = {
      type: 'question' as const,
      buttons: ['Don’t Allow', 'Allow Once', 'Always Allow', 'Always Block'],
      defaultId: 0,
      cancelId: 0,
      message: `Allow ${site} to ${label}?`,
      detail: '“Always” choices are remembered. You can change them in Settings → Privacy & Security.',
    };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response === 2 || response === 3) {
      saved[key] = response === 2;
      persist();
    } else once.set(key, response === 1);
    return response === 1 || response === 2;
  }

  function attach(ses: Session) {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (ALWAYS_OK.has(permission)) return callback(true);
      const label = PERMISSION_LABELS[permission];
      const site = hostOf(details.requestingUrl || wc.getURL());
      // Unknown permissions, "open another app" (handled elsewhere) and pages without a site are refused.
      if (!label || !site) return callback(false);
      const key = `${site}|${permission}`;
      if (key in saved) return callback(saved[key]);
      if (once.has(key)) return callback(once.get(key)!);
      let p = asking.get(key);
      if (!p) {
        p = ask(wc, site, permission, label).finally(() => asking.delete(key));
        asking.set(key, p);
      }
      void p.then(callback, () => callback(false));
    });
    ses.setPermissionCheckHandler((wc, permission, origin) => {
      if (ALWAYS_OK.has(permission)) return true;
      const key = `${hostOf(origin) || hostOf(wc?.getURL() ?? '')}|${permission}`;
      return saved[key] ?? once.get(key) ?? false;
    });
    // Devices (USB, serial, HID, Bluetooth) are never handed over silently.
    ses.setDevicePermissionHandler(() => false);
  }

  function forget(site?: string, permission?: string) {
    for (const k of Object.keys(saved)) {
      const [s, p] = k.split('|');
      if ((!site || s === site) && (!permission || p === permission)) delete saved[k];
    }
    for (const k of [...once.keys()]) if (!site || k.startsWith(`${site}|`)) once.delete(k);
    persist();
  }

  return { attach, list, forget };
}

export type Permissions = ReturnType<typeof createPermissions>;

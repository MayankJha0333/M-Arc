// Keeps the main process and the UI in step for Shields, downloads and privacy:
// settings go down, download progress and blocked counts come up.

import type { Prefs } from '@shared/ipc';
import { setSiteAllowed } from '@shared/shields';
import { updateSettings } from '@shared/settings';
import * as ops from '@shared/ops';
import { bridge } from './platform';
import { act, getS, setUi, toast, useKite } from './store';
import { surface } from './surfaces';
import { playSound } from './sound';

const prefsOf = (): Prefs => {
  const s = getS().settings;
  return { shields: s.shields, httpsOnly: s.httpsOnly, sendGpc: s.sendGpc, askWhereToSave: s.askWhereToSave };
};

export function startBrowser() {
  let last = '';
  const sync = () => {
    const p = prefsOf();
    const json = JSON.stringify(p);
    if (json === last) return;
    last = json;
    bridge.setPrefs(p);
  };
  sync();
  useKite.subscribe((st, prev) => {
    if (st.s.settings !== prev.s.settings) sync();
  });

  void bridge.downloads().then((downloads) => setUi({ downloads }));
  bridge.onDownloads((downloads) => setUi({ downloads }));
  bridge.onDownloadDone((d) => {
    playSound(d.state === 'completed' ? 'done' : 'error');
    if (d.state === 'completed') toast(`Downloaded “${d.name.slice(0, 44)}”`, 'Show', () => void bridge.downloadAction('reveal', d.id), 6000);
    else toast(`Couldn’t download “${d.name.slice(0, 36)}”${d.error ? `: ${d.error}` : ''}`, 'Downloads', () => setUi({ panel: 'downloads' }), 8000);
  });
  bridge.onShieldsCount(({ tabId, count }) => setUi((u) => (u.blocked[tabId] === count ? {} : { blocked: { ...u.blocked, [tabId]: count } })));
}

/** Turn blocking off or on for the site in the current tab, and reload it so the change shows. */
export function setShieldsForSite(url: string, on: boolean) {
  act((d) => updateSettings(d, { shields: setSiteAllowed(d.settings.shields, url, !on) }));
  setUi({ siteInfo: false });
  const t = ops.activeTab(getS());
  if (t) surface(t.id)?.reload();
  toast(on ? 'Shields are on for this site' : 'Shields are off for this site');
}

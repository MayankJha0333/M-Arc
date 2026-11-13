import { useEffect, useState } from 'react';
import { Palette, Layers, Keyboard, Route, Database, Info, RotateCcw, Upload, Download, Wand2, AlertTriangle, PanelLeft, PanelRight, ShieldCheck, Puzzle, RefreshCw, Trash2 } from 'lucide-react';
import { siteKey, type Shields } from '@shared/shields';
import type { ShieldsStatus, SitePermission } from '@shared/ipc';
import { ARCHIVE_CHOICES, SEARCH_ENGINES, SHORTCUT_LABELS, DEFAULT_SHORTCUTS, createInitialState } from '@shared/defaults';
import { clearHistory, exportBackup, readBackup, resetAppearance, resetShortcuts, setShortcut, shortcutConflict, updateSettings, LIMITS, type BackupInfo } from '@shared/settings';
import { formatShortcut, shortcutFromEvent } from '@shared/shortcuts';
import type { Settings as S } from '@shared/types';
import { activeSpace } from '@shared/tree';
import { act, getS, setUi, toast, useKite } from '../store';
import { bridge, isMac } from '../platform';
import { Sheet, Field, Segmented, Toggle } from './Sheet';
import { KiteLogo } from './KiteLogo';
import { openSpaceEditor } from './Spaces';
import { LookStudio, setLayout, useEffectiveLook } from './LookStudio';
import { sleepOtherTabs } from '../commands';
import { playSound } from '../sound';

type Section = 'appearance' | 'tabs' | 'privacy' | 'keys' | 'links' | 'data' | 'about';
const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'tabs', label: 'Tabs & Archive', icon: <Layers size={15} /> },
  { id: 'privacy', label: 'Privacy & Security', icon: <ShieldCheck size={15} /> },
  { id: 'keys', label: 'Keyboard', icon: <Keyboard size={15} /> },
  { id: 'links', label: 'Links & Boosts', icon: <Route size={15} /> },
  { id: 'data', label: 'Your Data', icon: <Database size={15} /> },
  { id: 'about', label: 'About', icon: <Info size={15} /> },
];

const set = (patch: Partial<S>) => act((d) => updateSettings(d, patch));

export function SettingsPanel({ initial }: { initial?: string }) {
  const [section, setSection] = useState<Section>((SECTIONS.find((x) => x.id === initial)?.id ?? 'appearance') as Section);
  return (
    <Sheet title="Settings" testId="settings" wide>
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <button key={x.id} className="settings-tab" data-on={section === x.id || undefined} data-testid={`settings-${x.id}`} onClick={() => setSection(x.id)}>
              {x.icon} {x.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {section === 'appearance' && <Appearance />}
          {section === 'tabs' && <TabsSection />}
          {section === 'privacy' && <Privacy />}
          {section === 'keys' && <Keys />}
          {section === 'links' && <Links />}
          {section === 'data' && <Data />}
          {section === 'about' && <About />}
        </div>
      </div>
    </Sheet>
  );
}

function Slider({ k, label, unit = 'px', step = 1, testId }: { k: keyof typeof LIMITS; label: string; unit?: string; step?: number; testId: string }) {
  const { settings } = useEffectiveLook();
  const v = settings[k] as number;
  const [lo, hi] = LIMITS[k];
  const shown = k === 'fontScale' ? `${Math.round(v * 100)}%` : `${v}${unit}`;
  const change = (n: number) => (k === 'radius' || k === 'gap' ? setLayout({ [k]: n }, set) : set({ [k]: n } as Partial<S>));
  return (
    <Field label={label} hint={shown}>
      <input type="range" className="range" min={lo} max={hi} step={step} value={v} data-testid={testId} onChange={(e) => change(Number(e.target.value))} />
    </Field>
  );
}

function Appearance() {
  const st = useEffectiveLook().settings;
  const space = useKite((x) => activeSpace(x.s));
  const [css, setCss] = useState(st.chromeCss);
  useEffect(() => {
    const t = setTimeout(() => css !== getS().settings.chromeCss && set({ chromeCss: css }), 250);
    return () => clearTimeout(t);
  }, [css]);
  return (
    <>
      <LookStudio />
      <h3 className="look-h look-h-layout">Layout and text</h3>
      <div className="settings-card" onClick={() => openSpaceEditor(space.id)} role="button" data-testid="settings-space-theme">
        <span className="import-swatch" style={{ background: `linear-gradient(135deg, ${space.theme.colors[0]}, ${space.theme.colors[1]})` }}>{space.icon}</span>
        <span className="import-space-text">
          <b>Name, icon and colours of “{space.name}”</b>
          <span className="muted">Each Space keeps its own colours and light/dark mode. Click to edit the Space.</span>
        </span>
      </div>
      <div className="field-row">
        <Field label="Sidebar side">
          <Segmented testId="set-side" value={st.sidebarSide} onChange={(v) => set({ sidebarSide: v })} options={[{ value: 'left', label: <><PanelLeft size={13} /> Left</> }, { value: 'right', label: <><PanelRight size={13} /> Right</> }]} />
        </Field>
        <Field label="Spacing">
          <Segmented testId="set-density" value={st.density} onChange={(v) => setLayout({ density: v }, set)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'roomy', label: 'Roomy' }]} />
        </Field>
      </div>
      <Field label="Font">
        <Segmented
          testId="set-font"
          value={st.font}
          onChange={(v) => setLayout({ font: v }, set)}
          options={[
            { value: 'figtree', label: <span style={{ fontFamily: 'Figtree' }}>Figtree</span> },
            { value: 'bricolage', label: <span style={{ fontFamily: "'Bricolage Grotesque'" }}>Bricolage</span> },
            { value: 'inter', label: <span style={{ fontFamily: 'Inter' }}>Inter</span> },
            { value: 'system', label: <span style={{ fontFamily: 'system-ui' }}>System</span> },
            { value: 'mono', label: <span style={{ fontFamily: 'ui-monospace, monospace' }}>Mono</span> },
          ]}
        />
      </Field>
      <div className="settings-grid">
        <Slider k="fontScale" label="Text size" step={0.05} testId="set-scale" />
        <Slider k="sidebarWidth" label="Sidebar width" testId="set-width" />
        <Slider k="radius" label="Corner roundness" testId="set-radius" />
        <Slider k="gap" label="Space around the page" testId="set-gap" />
        <Slider k="favoritesColumns" label="Favorites per row" unit="" testId="set-favcols" />
      </div>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={st.showUrlBar} onChange={(v) => set({ showUrlBar: v })} testId="set-urlbar" label="Show address bar" /> Show address bar in the sidebar</label>
        <label className="field-inline"><Toggle checked={st.showTabCloseOnHover} onChange={(v) => set({ showTabCloseOnHover: v })} testId="set-closehover" label="Close buttons on hover" /> Show close buttons on hover</label>
        <label className="field-inline"><Toggle checked={st.reduceMotion} onChange={(v) => set({ reduceMotion: v })} testId="set-motion" label="Reduce motion" /> Reduce motion</label>
      </div>
      <h3 className="look-h look-h-layout">Animation</h3>
      <div className="field-row" data-off={st.reduceMotion || undefined}>
        <Field label="Feel" hint="How things move">
          <Segmented testId="set-feel" value={st.motionFeel} onChange={(v) => set({ motionFeel: v })} options={[{ value: 'style', label: 'From style' }, { value: 'smooth', label: 'Smooth' }, { value: 'snappy', label: 'Snappy' }, { value: 'bouncy', label: 'Bouncy' }]} />
        </Field>
        <Field label="Speed" hint={st.motionSpeed === 1 ? 'Normal' : `${st.motionSpeed.toFixed(2).replace(/0$/, '')}× ${st.motionSpeed > 1 ? 'faster' : 'slower'}`}>
          <input type="range" className="range" min={LIMITS.motionSpeed[0]} max={LIMITS.motionSpeed[1]} step={0.25} value={st.motionSpeed} data-testid="set-speed" onChange={(e) => set({ motionSpeed: Number(e.target.value) })} />
        </Field>
      </div>
      <h3 className="look-h look-h-layout">Sound</h3>
      <div className="field-row">
        <label className="field-inline"><Toggle checked={st.sounds} onChange={(v) => set({ sounds: v })} testId="set-sounds" label="Interface sounds" /> Soft sounds for tabs, Spaces and downloads</label>
        <Field label="Volume" hint={`${Math.round(st.soundVolume * 100)}%`}>
          <span className="look-inline-range" data-off={!st.sounds || undefined}>
            <input type="range" className="range" min={0} max={1} step={0.05} value={st.soundVolume} data-testid="set-volume" onChange={(e) => set({ soundVolume: Number(e.target.value) })} />
            <button className="btn small" data-testid="set-sound-test" onClick={(e) => { e.preventDefault(); playSound('done', true); }}>Play</button>
          </span>
        </Field>
      </div>
      <Field label="Restyle Kite itself" hint="Advanced: your own CSS for Kite’s window">
        <textarea className="input" spellCheck={false} placeholder={'.sidebar { backdrop-filter: blur(20px); }\n.row[data-active] { border-radius: 4px; }'} value={css} data-testid="set-chrome-css" onChange={(e) => setCss(e.target.value)} />
      </Field>
      <button className="btn small" data-testid="set-reset-appearance" onClick={() => { setUi({ lookDraft: null }); act(resetAppearance); setCss(''); toast('Appearance reset'); }}>
        <RotateCcw size={13} /> Reset appearance
      </button>
    </>
  );
}

function archiveValue(ms: number | null) {
  return String(ms);
}

function TabsSection() {
  const st = useKite((x) => x.s.settings);
  const custom = !SEARCH_ENGINES.some((e) => e.template === st.searchEngine);
  const [tpl, setTpl] = useState(custom ? st.searchEngine : '');
  return (
    <>
      <Field label="Archive unused tabs after" hint="Pinned tabs and Favorites are never archived">
        <select className="input" value={archiveValue(st.archiveAfterMs)} data-testid="set-archive" onChange={(e) => set({ archiveAfterMs: e.target.value === 'null' ? null : Number(e.target.value) })}>
          {ARCHIVE_CHOICES.map((c) => <option key={c.label} value={archiveValue(c.ms)}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Close little windows after">
        <select className="input" value={archiveValue(st.littleArchiveAfterMs)} data-testid="set-little-archive" onChange={(e) => set({ littleArchiveAfterMs: e.target.value === 'null' ? null : Number(e.target.value) })}>
          {ARCHIVE_CHOICES.map((c) => <option key={c.label} value={archiveValue(c.ms)}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Memory" hint="Older tabs sleep: their page unloads and reloads when you open them. Playing tabs never sleep.">
        <span className="look-inline-range">
          <input type="range" className="range" min={LIMITS.awakeTabs[0]} max={LIMITS.awakeTabs[1]} value={st.awakeTabs} data-testid="set-awake" onChange={(e) => set({ awakeTabs: Number(e.target.value) })} />
          <b>{st.awakeTabs} tabs awake</b>
          <button className="btn small" data-testid="set-sleep-now" onClick={(e) => { e.preventDefault(); sleepOtherTabs(); }}>Sleep others now</button>
        </span>
      </Field>
      <Field label="Search engine">
        <select className="input" value={custom ? 'custom' : st.searchEngine} data-testid="set-engine" onChange={(e) => e.target.value !== 'custom' && set({ searchEngine: e.target.value })}>
          {SEARCH_ENGINES.map((e) => <option key={e.label} value={e.template}>{e.label}</option>)}
          <option value="custom">Custom…</option>
        </select>
        <form className="inline-form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); set({ searchEngine: tpl }); toast(getS().settings.searchEngine === tpl ? 'Search engine saved' : 'Use a full https:// address with %s where the words go'); }}>
          <input className="input" placeholder="https://example.com/search?q=%s" value={tpl} data-testid="set-engine-custom" onChange={(e) => setTpl(e.target.value)} />
          <button className="btn">Use</button>
        </form>
      </Field>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={st.peekOnExternalLinksFromPinned} onChange={(v) => set({ peekOnExternalLinksFromPinned: v })} testId="set-peek-pinned" label="Peek from pinned" /> Links from pinned tabs to other sites open in Peek</label>
        <label className="field-inline"><Toggle checked={st.peekOnShiftClick} onChange={(v) => set({ peekOnShiftClick: v })} testId="set-peek-shift" label="Shift-click Peek" /> Shift-click a link to Peek</label>
        <label className="field-inline"><Toggle checked={st.tidyTitles} onChange={(v) => set({ tidyTitles: v })} testId="set-tidy" label="Tidy titles" /> Shorten titles when pinning (“Inbox – Gmail” → “Inbox”)</label>
      </div>
      <Field label="Videos" hint="The floating window can be moved and resized anywhere on screen">
        <div className="settings-toggles">
          <label className="field-inline"><Toggle checked={st.autoPip} onChange={(v) => set({ autoPip: v })} testId="set-autopip" label="Pop out videos" /> Pop out a playing video when you switch tabs</label>
          <label className="field-inline" data-off={!st.autoPip || undefined}><Toggle checked={st.autoPip && st.autoPipOnAppSwitch} onChange={(v) => set({ autoPipOnAppSwitch: v })} testId="set-autopip-app" label="Also when switching apps" /> …and when you switch to another app</label>
        </div>
      </Field>
      <button className="btn small" data-testid="set-clear-history" onClick={() => { act(clearHistory); toast('History cleared'); }}>
        Clear browsing history
      </button>
    </>
  );
}

function Privacy() {
  const st = useKite((x) => x.s.settings);
  const sh = st.shields;
  const setSh = (p: Partial<Shields>) => set({ shields: { ...getS().settings.shields, ...p } });
  const [status, setStatus] = useState<ShieldsStatus | null>(null);
  const [perms, setPerms] = useState<SitePermission[]>([]);
  const [site, setSite] = useState('');
  const [what, setWhat] = useState({ cookies: true, cache: true, storage: true });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void bridge.shieldsStatus().then(setStatus);
    void bridge.permissions().then(setPerms);
    const a = bridge.onShieldsStatus(setStatus);
    const b = bridge.onPermissions(setPerms);
    return () => {
      a();
      b();
    };
  }, []);
  const addSite = () => {
    const k = siteKey(site);
    if (!k) return toast('Type a site like example.com');
    setSh({ allow: [...sh.allow.filter((x) => x !== k), k].sort() });
    setSite('');
  };
  const lists = !status
    ? ''
    : status.updating
      ? 'Downloading the filter lists…'
      : status.source === 'full'
        ? `Full filter lists, updated ${new Date(status.updatedAt).toLocaleDateString()}`
        : sh.enabled
          ? 'Using the small list built into Kite until the full lists download'
          : 'Off';
  return (
    <>
      <h3 className="look-h">Shields</h3>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={sh.enabled} onChange={(v) => setSh({ enabled: v })} testId="shields-enabled" label="Shields" /> <b>Block ads and trackers</b></label>
        <div className="settings-toggles settings-sub" data-off={!sh.enabled || undefined}>
          <label className="field-inline"><Toggle checked={sh.ads} onChange={(v) => setSh({ ads: v })} testId="shields-ads" label="Ads" /> Ads</label>
          <label className="field-inline"><Toggle checked={sh.trackers} onChange={(v) => setSh({ trackers: v })} testId="shields-trackers" label="Trackers" /> Trackers that follow you between sites</label>
          <label className="field-inline"><Toggle checked={sh.cookieBanners} onChange={(v) => setSh({ cookieBanners: v })} testId="shields-cookies" label="Cookie banners" /> Cookie-consent banners</label>
          <label className="field-inline"><Toggle checked={sh.cosmetic} onChange={(v) => setSh({ cosmetic: v })} testId="shields-cosmetic" label="Hide leftovers" /> Hide the empty boxes ads leave behind</label>
        </div>
      </div>
      <p className="muted shields-status" data-testid="shields-status">
        {lists}
        {status?.error && <span className="key-warn"> <AlertTriangle size={12} /> {status.error}</span>}{' '}
        {sh.enabled && <button className="btn small ghost" data-testid="shields-refresh" disabled={status?.updating} onClick={() => void bridge.refreshShields().then(setStatus)}><RefreshCw size={12} /> Update now</button>}
      </p>
      <p className="muted">The lists (EasyList, EasyPrivacy) are downloaded from easylist.to every few days. Nothing about you or your browsing is sent.</p>
      <Field label="Sites where nothing is blocked" hint="Use this when Shields break a site">
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); addSite(); }}>
          <input className="input" placeholder="example.com" value={site} data-testid="shields-allow-input" onChange={(e) => setSite(e.target.value)} />
          <button className="btn" data-testid="shields-allow-add">Add</button>
        </form>
        <span className="chip-list" data-testid="shields-allow-list">
          {sh.allow.map((a) => (
            <span className="chip" key={a}>{a} <button aria-label={`Remove ${a}`} onClick={(e) => { e.preventDefault(); setSh({ allow: sh.allow.filter((x) => x !== a) }); }}>×</button></span>
          ))}
        </span>
      </Field>

      <h3 className="look-h look-h-layout">Connection</h3>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={st.httpsOnly} onChange={(v) => set({ httpsOnly: v })} testId="set-https" label="HTTPS-only" /> Always use a secure connection (https) when a site offers one</label>
        <label className="field-inline"><Toggle checked={st.sendGpc} onChange={(v) => set({ sendGpc: v })} testId="set-gpc" label="Global Privacy Control" /> Tell sites not to sell or share my data (Global Privacy Control)</label>
      </div>

      <h3 className="look-h look-h-layout">Downloads</h3>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={st.askWhereToSave} onChange={(v) => set({ askWhereToSave: v })} testId="set-ask-save" label="Ask where to save" /> Ask where to save each file</label>
      </div>
      <p className="muted">Kite always asks before keeping a file that can run programs (apps, installers, scripts).</p>

      <h3 className="look-h look-h-layout">Site permissions</h3>
      <p className="muted">Sites must ask before using your camera, microphone, location or notifications. These are the answers you chose to remember.</p>
      <div className="perm-list" data-testid="perm-list">
        {perms.length === 0 && <span className="muted">Nothing remembered.</span>}
        {perms.map((p) => (
          <div className="perm-row" key={`${p.site}|${p.permission}`} data-allowed={p.allowed || undefined}>
            <b>{p.site}</b>
            <span>{p.allowed ? 'may' : 'may not'} {p.label}</span>
            <button className="icon-btn tiny" aria-label="Forget" title="Forget (the site will ask again)" onClick={() => bridge.forgetPermission(p.site, p.permission)}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      {perms.length > 0 && <button className="btn small" data-testid="perm-forget-all" onClick={() => bridge.forgetPermission()}>Forget all</button>}

      <h3 className="look-h look-h-layout">Clear browsing data</h3>
      <div className="settings-toggles">
        <label className="field-inline"><Toggle checked={what.cookies} onChange={(v) => setWhat({ ...what, cookies: v })} testId="clear-cookies" label="Cookies" /> Cookies (signs you out of sites)</label>
        <label className="field-inline"><Toggle checked={what.storage} onChange={(v) => setWhat({ ...what, storage: v })} testId="clear-storage" label="Site data" /> Data sites saved on this computer</label>
        <label className="field-inline"><Toggle checked={what.cache} onChange={(v) => setWhat({ ...what, cache: v })} testId="clear-cache" label="Cache" /> Cached images and files</label>
      </div>
      {confirm ? (
        <span className="inline-form">
          <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
          <button className="btn small danger-solid" data-testid="clear-data-confirm" onClick={async () => { await bridge.clearData(what); setConfirm(false); toast('Browsing data cleared in every Space'); }}>Clear in every Space</button>
        </span>
      ) : (
        <button className="btn small danger" data-testid="clear-data" disabled={!what.cookies && !what.cache && !what.storage} onClick={() => setConfirm(true)}>Clear…</button>
      )}
    </>
  );
}

function Recorder({ action }: { action: string }) {
  const combo = useKite((x) => x.s.settings.shortcuts[action] ?? '');
  const [rec, setRec] = useState(false);
  const [warn, setWarn] = useState('');
  return (
    <div className="key-row" data-testid={`key-${action}`}>
      <span className="key-label">{SHORTCUT_LABELS[action] ?? action}</span>
      <button
        className="key-btn"
        data-recording={rec ? 'true' : undefined}
        data-testid={`key-btn-${action}`}
        onClick={() => {
          setWarn('');
          setRec(true);
        }}
        onBlur={() => setRec(false)}
        onKeyDown={(e) => {
          if (!rec) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') return setRec(false);
          if (e.key === 'Backspace' || e.key === 'Delete') {
            act((d) => void setShortcut(d, action, ''));
            return setRec(false);
          }
          const sc = shortcutFromEvent(e, isMac);
          if (!sc) return;
          const other = shortcutConflict(getS(), action, sc);
          act((d) => void setShortcut(d, action, sc));
          setRec(false);
          if (other) setWarn(`Was used by “${SHORTCUT_LABELS[other] ?? other}” — that one now has no shortcut.`);
        }}
      >
        {rec ? 'Press keys…' : combo ? formatShortcut(combo, isMac) : <span className="muted">None</span>}
      </button>
      {combo !== (DEFAULT_SHORTCUTS[action] ?? '') && (
        <button className="icon-btn tiny" aria-label="Reset" title="Back to default" data-testid={`key-reset-${action}`} onClick={() => act((d) => resetShortcuts(d, action))}>
          <RotateCcw size={12} />
        </button>
      )}
      {warn && <span className="key-warn" data-testid="key-warn"><AlertTriangle size={12} /> {warn}</span>}
    </div>
  );
}

function Keys() {
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Click a shortcut, then press the new keys. <kbd>⌫</kbd> removes it, <kbd>esc</kbd> cancels. “{SHORTCUT_LABELS.littleWindow}” also works when Kite is in the background. {isMac ? '⌘1–⌘9' : 'Ctrl+1–9'} jump to tabs and ⌃1–⌃9 to Spaces.
      </p>
      <div className="keys">
        {Object.keys(DEFAULT_SHORTCUTS).map((a) => (
          <Recorder key={a} action={a} />
        ))}
      </div>
      <button className="btn small" data-testid="keys-reset-all" onClick={() => { act((d) => resetShortcuts(d)); toast('Shortcuts reset'); }}>
        <RotateCcw size={13} /> Reset all shortcuts
      </button>
    </>
  );
}

function Links() {
  const boosts = useKite((x) => x.s.boosts.length);
  const routes = useKite((x) => x.s.routes.length);
  return (
    <>
      <div className="settings-card" role="button" data-testid="settings-open-routing" onClick={() => setUi({ panel: 'routing' })}>
        <span className="import-swatch"><Route size={16} /></span>
        <span className="import-space-text"><b>Link Routing</b><span className="muted">{routes} rule{routes === 1 ? '' : 's'} · where links from other apps open · default browser</span></span>
      </div>
      <div className="settings-card" role="button" data-testid="settings-open-extensions" onClick={() => setUi({ panel: 'extensions' })}>
        <span className="import-swatch"><Puzzle size={16} /></span>
        <span className="import-space-text"><b>Extensions</b><span className="muted">Add and manage Chrome extensions</span></span>
      </div>
      <div className="settings-card" role="button" data-testid="settings-open-boosts" onClick={() => setUi({ panel: 'boosts' })}>
        <span className="import-swatch"><Wand2 size={16} /></span>
        <span className="import-space-text"><b>Boosts</b><span className="muted">{boosts} Boost{boosts === 1 ? '' : 's'} · restyle sites, hide clutter</span></span>
      </div>
    </>
  );
}

function Data() {
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<BackupInfo | null>(null);
  return (
    <>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Everything Kite knows lives in one file on this computer. No account, no server, nothing is sent anywhere.
      </p>
      <div className="settings-card" role="button" data-testid="settings-import-arc" onClick={() => setUi({ panel: 'import' })}>
        <span className="import-swatch"><Download size={16} /></span>
        <span className="import-space-text"><b>Import from Arc</b><span className="muted">Bring your Spaces, pinned tabs, folders and Favorites</span></span>
      </div>
      <div className="inline-form">
        <button className="btn" data-testid="backup-export" onClick={async () => { if (await bridge.exportFile(`kite-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(getS()))) toast('Backup saved'); }}>
          <Download size={14} /> Back up Kite…
        </button>
        <label className="btn">
          <Upload size={14} /> Restore a backup…
          <input
            type="file"
            accept=".json"
            hidden
            data-testid="backup-import"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setPending(readBackup(await f.text()));
                setErr('');
              } catch (x) {
                setPending(null);
                setErr((x as Error).message);
              }
            }}
          />
        </label>
      </div>
      {err && <div className="import-error" data-testid="backup-error"><AlertTriangle size={14} /> {err}</div>}
      {pending && (
        <div className="danger-zone" data-testid="backup-confirm">
          <b>Replace everything in Kite with this backup?</b>
          <span className="muted">
            It has {pending.spaces} Space{pending.spaces === 1 ? '' : 's'}, {pending.tabs} tab{pending.tabs === 1 ? '' : 's'}, {pending.notes} note{pending.notes === 1 ? '' : 's'} and {pending.boosts} Boost{pending.boosts === 1 ? '' : 's'}.
            {pending.scriptsRemoved > 0 && ` ${pending.scriptsRemoved} Boost script${pending.scriptsRemoved === 1 ? ' was' : 's were'} left out for safety.`} A daily copy of your current data stays in Kite’s backups folder.
          </span>
          <span className="inline-form">
            <button className="btn small" onClick={() => setPending(null)}>Cancel</button>
            <button
              className="btn small danger-solid"
              data-testid="backup-restore-confirm"
              onClick={() => {
                const before = getS();
                act((d) => Object.assign(d, pending.state));
                setPending(null);
                setUi({ loaded: [] });
                toast('Backup restored', 'Undo', () => act((d) => Object.assign(d, before)), 10_000);
              }}
            >
              Replace with backup
            </button>
          </span>
        </div>
      )}
      <div className="danger-zone">
        <b>Start over</b>
        <span className="muted">Removes all Spaces, tabs, notes, Boosts and settings from Kite.</span>
        {confirm ? (
          <span className="inline-form">
            <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn small danger-solid" data-testid="reset-all-confirm" onClick={() => { act((d) => Object.assign(d, createInitialState())); setConfirm(false); setUi({ panel: null, loaded: [] }); toast('Kite was reset'); }}>
              Yes, erase everything
            </button>
          </span>
        ) : (
          <button className="btn small danger" data-testid="reset-all" onClick={() => setConfirm(true)}>Reset Kite…</button>
        )}
      </div>
    </>
  );
}

function About() {
  return (
    <div className="about">
      <KiteLogo size={72} />
      <h3>Kite</h3>
      <p className="muted">Version 0.1.0 · A calm, sidebar-first browser that works fully offline.</p>
      <p className="muted">Made by Mayank Jha. Built with Electron, React and TypeScript.</p>
    </div>
  );
}

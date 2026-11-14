import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Layers, Keyboard, Route, Database, Info, RotateCcw, Upload, Download, Wand2, AlertTriangle, PanelLeft, PanelRight, ShieldCheck, Puzzle, RefreshCw, Trash2, Search, ChevronRight, X } from 'lucide-react';
import { siteKey, type Shields } from '@shared/shields';
import type { ShieldsStatus, SitePermission } from '@shared/ipc';
import { ARCHIVE_CHOICES, SEARCH_ENGINES, SHORTCUT_LABELS, DEFAULT_SHORTCUTS, createInitialState } from '@shared/defaults';
import { clearHistory, exportBackup, readBackup, resetAppearance, resetShortcuts, setShortcut, shortcutConflict, updateSettings, LIMITS, type BackupInfo } from '@shared/settings';
import { formatShortcut, shortcutFromEvent } from '@shared/shortcuts';
import type { Settings as S } from '@shared/types';
import { activeSpace } from '@shared/tree';
import { act, getS, setUi, toast, useKite } from '../store';
import { bridge, isMac } from '../platform';
import { Page, Segmented, Group, Row, SwitchRow } from './Sheet';
import { KiteLogo } from './KiteLogo';
import { openSpaceEditor } from './Spaces';
import { LookStudio, setLayout, useEffectiveLook } from './LookStudio';
import { sleepOtherTabs } from '../commands';
import { playSound } from '../sound';

type Section = 'appearance' | 'tabs' | 'privacy' | 'keys' | 'links' | 'data' | 'about';
interface SectionDef {
  id: Section;
  label: string;
  /** One line under the section title. */
  desc: string;
  icon: React.ReactNode;
  /** Extra words the search box matches (what lives in the section). */
  words: string;
}
const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: 'Appearance', desc: 'Themes, colours, layout, type and motion', icon: <Palette size={15} />, words: 'theme style colour color dark light mode accent font text size sidebar side width corner radius spacing density gap favorites animation motion speed sound volume css address bar' },
  { id: 'tabs', label: 'Tabs & Browsing', desc: 'Archiving, memory, search, Peek and videos', icon: <Layers size={15} />, words: 'archive tabs little window memory sleep search engine peek pinned titles video picture floating history' },
  { id: 'privacy', label: 'Privacy & Security', desc: 'Shields, connection, permissions and site data', icon: <ShieldCheck size={15} />, words: 'shields ads trackers cookie banners https gpc downloads permissions camera microphone location notifications clear data cache' },
  { id: 'keys', label: 'Keyboard', desc: 'Every shortcut, ready to change', icon: <Keyboard size={15} />, words: 'shortcut keys hotkey keyboard' },
  { id: 'links', label: 'Links & Boosts', desc: 'Routing, extensions and site restyles', icon: <Route size={15} />, words: 'routing default browser extensions chrome boosts restyle' },
  { id: 'data', label: 'Your Data', desc: 'Import, back up, restore or start over', icon: <Database size={15} />, words: 'import arc backup restore export reset erase' },
  { id: 'about', label: 'About Kite', desc: 'Version and credits', icon: <Info size={15} />, words: 'version about credits' },
];

/** Sections whose name, description or contents match what you typed. */
export function matchSections(query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (!q) return SECTIONS.map((x) => x.id);
  const parts = q.split(/\s+/);
  return SECTIONS.filter((x) => {
    const hay = `${x.label} ${x.desc} ${x.words}`.toLowerCase();
    return parts.every((p) => hay.includes(p));
  }).map((x) => x.id);
}

const set = (patch: Partial<S>) => act((d) => updateSettings(d, patch));

export function SettingsPanel({ initial }: { initial?: string }) {
  const [section, setSection] = useState<Section>((SECTIONS.find((x) => x.id === initial)?.id ?? 'appearance') as Section);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchSections(query), [query]);
  const body = useRef<HTMLDivElement>(null);
  // Searching jumps to the first section that matches.
  useEffect(() => {
    if (shown.length && !shown.includes(section)) setSection(shown[0]);
  }, [shown, section]);
  // A new section starts at its top.
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [section]);
  // While searching, bring the first matching setting into view and mark it briefly.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q || !body.current) return;
    const t = window.setTimeout(() => {
      const root = body.current;
      if (!root) return;
      const hit = Array.from(root.querySelectorAll<HTMLElement>('.set-row-title, .set-group-title, .look-h, .key-label')).find((el) => el.textContent?.toLowerCase().includes(q));
      const row = hit?.closest<HTMLElement>('.set-row, .set-group-head, .look-sec, .key-row') ?? hit;
      if (!row) return;
      root.querySelectorAll('[data-hit]').forEach((el) => el.removeAttribute('data-hit'));
      row.scrollIntoView({ block: 'center', behavior: useKite.getState().s.settings.reduceMotion ? 'auto' : 'smooth' });
      row.setAttribute('data-hit', 'true');
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, section]);
  const def = SECTIONS.find((x) => x.id === section)!;
  return (
    <Page title="Settings" testId="settings">
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-brand">Settings</div>
          <label className="settings-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search settings"
              aria-label="Search settings"
              value={query}
              data-testid="settings-search"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  setQuery('');
                }
              }}
            />
            {query && (
              <button className="settings-search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={12} />
              </button>
            )}
          </label>
          <div className="settings-tabs" role="tablist" aria-orientation="vertical">
            {SECTIONS.filter((x) => shown.includes(x.id)).map((x) => (
              <button key={x.id} role="tab" aria-selected={section === x.id} aria-label={x.label} title={x.label} className="settings-tab" data-on={section === x.id || undefined} data-testid={`settings-${x.id}`} onClick={() => setSection(x.id)}>
                <span className="settings-tab-icon">{x.icon}</span>
                <span className="settings-tab-label">{x.label}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="settings-nomatch" data-testid="settings-nomatch">No settings match “{query.trim()}”.</p>}
          </div>
          <div className="settings-nav-foot">
            <KiteLogo size={16} /> Kite 0.1.0 · works offline
          </div>
        </nav>
        <div className="settings-main" ref={body}>
          <header className="settings-head" key={`h-${section}`}>
            <span className="settings-head-icon">{def.icon}</span>
            <div>
              <h2 className="settings-head-title">{def.label}</h2>
              <p className="settings-head-desc">{def.desc}</p>
            </div>
          </header>
          <div className="settings-body" key={section} role="tabpanel" aria-label={def.label}>
            {section === 'appearance' && <Appearance />}
            {section === 'tabs' && <TabsSection />}
            {section === 'privacy' && <Privacy />}
            {section === 'keys' && <Keys />}
            {section === 'links' && <Links />}
            {section === 'data' && <Data />}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </Page>
  );
}

function Slider({ k, label, unit = 'px', step = 1, testId }: { k: keyof typeof LIMITS; label: string; unit?: string; step?: number; testId: string }) {
  const { settings } = useEffectiveLook();
  const v = settings[k] as number;
  const [lo, hi] = LIMITS[k];
  const shown = k === 'fontScale' ? `${Math.round(v * 100)}%` : `${v}${unit}`;
  const change = (n: number) => (k === 'radius' || k === 'gap' ? setLayout({ [k]: n }, set) : set({ [k]: n } as Partial<S>));
  return (
    <Row title={label} value={shown}>
      <input type="range" className="range" aria-label={label} min={lo} max={hi} step={step} value={v} data-testid={testId} onChange={(e) => change(Number(e.target.value))} />
    </Row>
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
      <Group title="This Space" desc="Each Space keeps its own name, icon, colours and light or dark mode.">
        <button className="set-link" onClick={() => openSpaceEditor(space.id)} data-testid="settings-space-theme">
          <span className="import-swatch" style={{ background: `linear-gradient(135deg, ${space.theme.colors[0]}, ${space.theme.colors[1]})` }}>{space.icon}</span>
          <span className="set-row-text">
            <span className="set-row-title">Edit “{space.name}”</span>
            <span className="set-row-desc">Name, icon and colours</span>
          </span>
          <ChevronRight size={15} className="set-link-chevron" />
        </button>
      </Group>
      <Group title="Layout" desc="Where things sit and how much room they take.">
        <Row title="Sidebar side">
          <Segmented testId="set-side" value={st.sidebarSide} onChange={(v) => set({ sidebarSide: v })} options={[{ value: 'left', label: <><PanelLeft size={13} /> Left</> }, { value: 'right', label: <><PanelRight size={13} /> Right</> }]} />
        </Row>
        <Row title="Spacing" desc="How tall tabs and rows are">
          <Segmented testId="set-density" value={st.density} onChange={(v) => setLayout({ density: v }, set)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'roomy', label: 'Roomy' }]} />
        </Row>
        <Slider k="sidebarWidth" label="Sidebar width" testId="set-width" />
        <Slider k="gap" label="Space around the page" testId="set-gap" />
        <Slider k="radius" label="Corner roundness" testId="set-radius" />
        <Slider k="favoritesColumns" label="Favorites per row" unit="" testId="set-favcols" />
        <SwitchRow title="Address bar in the sidebar" checked={st.showUrlBar} onChange={(v) => set({ showUrlBar: v })} testId="set-urlbar" />
        <SwitchRow title="Close buttons on hover" desc="Otherwise only the selected tab shows one" checked={st.showTabCloseOnHover} onChange={(v) => set({ showTabCloseOnHover: v })} testId="set-closehover" />
      </Group>
      <Group title="Text">
        <Row title="Font" stack>
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
        </Row>
        <Slider k="fontScale" label="Text size" step={0.05} testId="set-scale" />
      </Group>
      <Group title="Motion" desc="How things move. Kite follows your system's Reduce Motion too.">
        <SwitchRow title="Reduce motion" desc="Turn off animations and transitions" checked={st.reduceMotion} onChange={(v) => set({ reduceMotion: v })} testId="set-motion" />
        <Row title="Feel" off={st.reduceMotion}>
          <Segmented testId="set-feel" value={st.motionFeel} onChange={(v) => set({ motionFeel: v })} options={[{ value: 'style', label: 'From style' }, { value: 'smooth', label: 'Smooth' }, { value: 'snappy', label: 'Snappy' }, { value: 'bouncy', label: 'Bouncy' }]} />
        </Row>
        <Row title="Speed" value={st.motionSpeed === 1 ? 'Normal' : `${st.motionSpeed.toFixed(2).replace(/0$/, '')}× ${st.motionSpeed > 1 ? 'faster' : 'slower'}`} off={st.reduceMotion}>
          <input type="range" className="range" aria-label="Animation speed" min={LIMITS.motionSpeed[0]} max={LIMITS.motionSpeed[1]} step={0.25} value={st.motionSpeed} data-testid="set-speed" onChange={(e) => set({ motionSpeed: Number(e.target.value) })} />
        </Row>
      </Group>
      <Group title="Sound">
        <SwitchRow title="Interface sounds" desc="Soft sounds for tabs, Spaces and downloads" checked={st.sounds} onChange={(v) => set({ sounds: v })} testId="set-sounds" />
        <Row title="Volume" value={`${Math.round(st.soundVolume * 100)}%`} off={!st.sounds}>
          <span className="look-inline-range">
            <input type="range" className="range" aria-label="Volume" min={0} max={1} step={0.05} value={st.soundVolume} data-testid="set-volume" onChange={(e) => set({ soundVolume: Number(e.target.value) })} />
            <button className="btn small" data-testid="set-sound-test" onClick={(e) => { e.preventDefault(); playSound('done', true); }}>Play</button>
          </span>
        </Row>
      </Group>
      <Group title="Advanced" desc="Your own CSS for Kite’s window. It applies on top of everything above.">
        <Row title="Restyle Kite itself" stack>
          <textarea className="input" aria-label="Custom CSS for Kite" spellCheck={false} placeholder={'.sidebar { backdrop-filter: blur(20px); }\n.row[data-active] { border-radius: 4px; }'} value={css} data-testid="set-chrome-css" onChange={(e) => setCss(e.target.value)} />
        </Row>
        <Row title="Reset appearance" desc="Back to the default theme, layout, type and motion">
          <button className="btn small" data-testid="set-reset-appearance" onClick={() => { setUi({ lookDraft: null }); act(resetAppearance); setCss(''); toast('Appearance reset'); }}>
            <RotateCcw size={13} /> Reset
          </button>
        </Row>
      </Group>
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
      <Group title="Tidying up" desc="Pinned tabs and Favorites are never archived.">
        <Row title="Archive unused tabs after">
          <select className="input" aria-label="Archive unused tabs after" value={archiveValue(st.archiveAfterMs)} data-testid="set-archive" onChange={(e) => set({ archiveAfterMs: e.target.value === 'null' ? null : Number(e.target.value) })}>
            {ARCHIVE_CHOICES.map((c) => <option key={c.label} value={archiveValue(c.ms)}>{c.label}</option>)}
          </select>
        </Row>
        <Row title="Close little windows after">
          <select className="input" aria-label="Close little windows after" value={archiveValue(st.littleArchiveAfterMs)} data-testid="set-little-archive" onChange={(e) => set({ littleArchiveAfterMs: e.target.value === 'null' ? null : Number(e.target.value) })}>
            {ARCHIVE_CHOICES.map((c) => <option key={c.label} value={archiveValue(c.ms)}>{c.label}</option>)}
          </select>
        </Row>
        <SwitchRow title="Tidy titles when pinning" desc="“Inbox – Gmail” becomes “Inbox”" checked={st.tidyTitles} onChange={(v) => set({ tidyTitles: v })} testId="set-tidy" />
      </Group>
      <Group title="Memory" desc="Older tabs sleep: their page unloads and reloads when you open them. Playing tabs never sleep.">
        <Row title="Tabs kept awake" value={`${st.awakeTabs} tabs`}>
          <span className="look-inline-range">
            <input type="range" className="range" aria-label="Tabs kept awake" min={LIMITS.awakeTabs[0]} max={LIMITS.awakeTabs[1]} value={st.awakeTabs} data-testid="set-awake" onChange={(e) => set({ awakeTabs: Number(e.target.value) })} />
            <button className="btn small" data-testid="set-sleep-now" onClick={(e) => { e.preventDefault(); sleepOtherTabs(); }}>Sleep others now</button>
          </span>
        </Row>
      </Group>
      <Group title="Search">
        <Row title="Search engine">
          <select className="input" aria-label="Search engine" value={custom ? 'custom' : st.searchEngine} data-testid="set-engine" onChange={(e) => e.target.value !== 'custom' && set({ searchEngine: e.target.value })}>
            {SEARCH_ENGINES.map((e) => <option key={e.label} value={e.template}>{e.label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </Row>
        <Row title="Your own search engine" desc="A full https:// address with %s where the words go" stack>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); set({ searchEngine: tpl }); toast(getS().settings.searchEngine === tpl ? 'Search engine saved' : 'Use a full https:// address with %s where the words go'); }}>
            <input className="input" aria-label="Custom search address" placeholder="https://example.com/search?q=%s" value={tpl} data-testid="set-engine-custom" onChange={(e) => setTpl(e.target.value)} />
            <button className="btn">Use</button>
          </form>
        </Row>
      </Group>
      <Group title="Peek" desc="A quick look at a link without leaving the page you are on.">
        <SwitchRow title="Peek from pinned tabs" desc="Links from pinned tabs to other sites open in Peek" checked={st.peekOnExternalLinksFromPinned} onChange={(v) => set({ peekOnExternalLinksFromPinned: v })} testId="set-peek-pinned" />
        <SwitchRow title="Shift-click to Peek" checked={st.peekOnShiftClick} onChange={(v) => set({ peekOnShiftClick: v })} testId="set-peek-shift" />
      </Group>
      <Group title="Videos" desc="The floating window can be moved and resized anywhere on screen.">
        <SwitchRow title="Pop out a playing video" desc="When you switch to another tab" checked={st.autoPip} onChange={(v) => set({ autoPip: v })} testId="set-autopip" />
        <SwitchRow title="Also when you switch apps" checked={st.autoPip && st.autoPipOnAppSwitch} onChange={(v) => set({ autoPipOnAppSwitch: v })} testId="set-autopip-app" off={!st.autoPip} />
      </Group>
      <Group title="History">
        <Row title="Browsing history" desc="What the command bar suggests from">
          <button className="btn small" data-testid="set-clear-history" onClick={() => { act(clearHistory); toast('History cleared'); }}>
            Clear history
          </button>
        </Row>
      </Group>
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
      <Group title="Shields" desc="Block ads and trackers on every site. Nothing about you or your browsing is sent anywhere.">
        <SwitchRow title={<b>Block ads and trackers</b>} checked={sh.enabled} onChange={(v) => setSh({ enabled: v })} testId="shields-enabled" label="Shields" />
        <SwitchRow title="Ads" checked={sh.ads} onChange={(v) => setSh({ ads: v })} testId="shields-ads" off={!sh.enabled} sub />
        <SwitchRow title="Trackers" desc="That follow you between sites" checked={sh.trackers} onChange={(v) => setSh({ trackers: v })} testId="shields-trackers" off={!sh.enabled} sub />
        <SwitchRow title="Cookie banners" desc="Cookie-consent pop-ups" checked={sh.cookieBanners} onChange={(v) => setSh({ cookieBanners: v })} testId="shields-cookies" off={!sh.enabled} sub />
        <SwitchRow title="Hide leftovers" desc="The empty boxes ads leave behind" checked={sh.cosmetic} onChange={(v) => setSh({ cosmetic: v })} testId="shields-cosmetic" label="Hide leftovers" off={!sh.enabled} sub />
        <Row title="Filter lists" desc="EasyList and EasyPrivacy, refreshed from easylist.to every few days">
          <span className="shields-status-wrap">
            <span className="muted shields-status" data-testid="shields-status">
              {lists}
              {status?.error && <span className="key-warn"> <AlertTriangle size={12} /> {status.error}</span>}
            </span>
            {sh.enabled && <button className="btn small ghost" data-testid="shields-refresh" disabled={status?.updating} onClick={() => void bridge.refreshShields().then(setStatus)}><RefreshCw size={12} /> Update now</button>}
          </span>
        </Row>
        <Row title="Sites where nothing is blocked" desc="Use this when Shields break a site" stack>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); addSite(); }}>
            <input className="input" aria-label="Site to allow" placeholder="example.com" value={site} data-testid="shields-allow-input" onChange={(e) => setSite(e.target.value)} />
            <button className="btn" data-testid="shields-allow-add">Add</button>
          </form>
          <span className="chip-list" data-testid="shields-allow-list">
            {sh.allow.map((a) => (
              <span className="chip" key={a}>{a} <button aria-label={`Remove ${a}`} onClick={(e) => { e.preventDefault(); setSh({ allow: sh.allow.filter((x) => x !== a) }); }}>×</button></span>
            ))}
          </span>
        </Row>
      </Group>

      <Group title="Connection">
        <SwitchRow title="HTTPS-only" desc="Always use a secure connection when a site offers one" checked={st.httpsOnly} onChange={(v) => set({ httpsOnly: v })} testId="set-https" />
        <SwitchRow title="Global Privacy Control" desc="Tell sites not to sell or share my data" checked={st.sendGpc} onChange={(v) => set({ sendGpc: v })} testId="set-gpc" />
      </Group>

      <Group title="Downloads" desc="Kite always asks before keeping a file that can run programs (apps, installers, scripts).">
        <SwitchRow title="Ask where to save each file" checked={st.askWhereToSave} onChange={(v) => set({ askWhereToSave: v })} testId="set-ask-save" label="Ask where to save" />
      </Group>

      <Group title="Site permissions" desc="Sites must ask before using your camera, microphone, location or notifications. These are the answers you chose to remember.">
        <div className="perm-list" data-testid="perm-list">
          {perms.length === 0 && <span className="muted set-empty">Nothing remembered yet.</span>}
          {perms.map((p) => (
            <div className="perm-row" key={`${p.site}|${p.permission}`} data-allowed={p.allowed || undefined}>
              <b>{p.site}</b>
              <span>{p.allowed ? 'may' : 'may not'} {p.label}</span>
              <button className="icon-btn tiny" aria-label="Forget" title="Forget (the site will ask again)" onClick={() => bridge.forgetPermission(p.site, p.permission)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        {perms.length > 0 && (
          <Row title="Forget every answer">
            <button className="btn small" data-testid="perm-forget-all" onClick={() => bridge.forgetPermission()}>Forget all</button>
          </Row>
        )}
      </Group>

      <Group title="Clear browsing data" desc="Clears it in every Space.">
        <SwitchRow title="Cookies" desc="Signs you out of sites" checked={what.cookies} onChange={(v) => setWhat({ ...what, cookies: v })} testId="clear-cookies" />
        <SwitchRow title="Site data" desc="Data sites saved on this computer" checked={what.storage} onChange={(v) => setWhat({ ...what, storage: v })} testId="clear-storage" />
        <SwitchRow title="Cache" desc="Cached images and files" checked={what.cache} onChange={(v) => setWhat({ ...what, cache: v })} testId="clear-cache" />
        <Row title={confirm ? 'Clear the selected data in every Space?' : 'Clear now'}>
          {confirm ? (
            <span className="inline-form">
              <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn small danger-solid" data-testid="clear-data-confirm" onClick={async () => { await bridge.clearData(what); setConfirm(false); toast('Browsing data cleared in every Space'); }}>Clear in every Space</button>
            </span>
          ) : (
            <button className="btn small danger" data-testid="clear-data" disabled={!what.cookies && !what.cache && !what.storage} onClick={() => setConfirm(true)}>Clear…</button>
          )}
        </Row>
      </Group>
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
      <p className="settings-intro">
        Click a shortcut, then press the new keys. <kbd>⌫</kbd> removes it, <kbd>esc</kbd> cancels. “{SHORTCUT_LABELS.littleWindow}” also works when Kite is in the background. {isMac ? '⌘1–⌘9' : 'Ctrl+1–9'} jump to tabs and ⌃1–⌃9 to Spaces.
      </p>
      <Group>
        <div className="keys">
          {Object.keys(DEFAULT_SHORTCUTS).map((a) => (
            <Recorder key={a} action={a} />
          ))}
        </div>
      </Group>
      <div className="settings-actions">
        <button className="btn small" data-testid="keys-reset-all" onClick={() => { act((d) => resetShortcuts(d)); toast('Shortcuts reset'); }}>
          <RotateCcw size={13} /> Reset all shortcuts
        </button>
      </div>
    </>
  );
}

function Links() {
  const boosts = useKite((x) => x.s.boosts.length);
  const routes = useKite((x) => x.s.routes.length);
  return (
    <Group>
      <button className="set-link" data-testid="settings-open-routing" onClick={() => setUi({ panel: 'routing' })}>
        <span className="import-swatch"><Route size={16} /></span>
        <span className="set-row-text"><span className="set-row-title">Link Routing</span><span className="set-row-desc">{routes} rule{routes === 1 ? '' : 's'} · where links from other apps open · default browser</span></span>
        <ChevronRight size={15} className="set-link-chevron" />
      </button>
      <button className="set-link" data-testid="settings-open-extensions" onClick={() => setUi({ panel: 'extensions' })}>
        <span className="import-swatch"><Puzzle size={16} /></span>
        <span className="set-row-text"><span className="set-row-title">Extensions</span><span className="set-row-desc">Add and manage Chrome extensions</span></span>
        <ChevronRight size={15} className="set-link-chevron" />
      </button>
      <button className="set-link" data-testid="settings-open-boosts" onClick={() => setUi({ panel: 'boosts' })}>
        <span className="import-swatch"><Wand2 size={16} /></span>
        <span className="set-row-text"><span className="set-row-title">Boosts</span><span className="set-row-desc">{boosts} Boost{boosts === 1 ? '' : 's'} · restyle sites, hide clutter</span></span>
        <ChevronRight size={15} className="set-link-chevron" />
      </button>
    </Group>
  );
}

function Data() {
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<BackupInfo | null>(null);
  return (
    <>
      <p className="settings-intro">
        Everything Kite knows lives in one file on this computer. No account, no server, nothing is sent anywhere.
      </p>
      <Group title="Bring things in">
        <button className="set-link" data-testid="settings-import-arc" onClick={() => setUi({ panel: 'import' })}>
          <span className="import-swatch"><Download size={16} /></span>
          <span className="set-row-text"><span className="set-row-title">Import from Arc</span><span className="set-row-desc">Bring your Spaces, pinned tabs, folders and Favorites</span></span>
          <ChevronRight size={15} className="set-link-chevron" />
        </button>
      </Group>
      <Group title="Backups" desc="A single file with all your Spaces, tabs, notes, Boosts and settings.">
      <Row title="Back up or restore">
      <div className="inline-form">
        <button className="btn" data-testid="backup-export" onClick={async () => { if (await bridge.exportFile(`kite-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(getS()))) toast('Backup saved'); }}>
          <Download size={14} /> Back up…
        </button>
        <label className="btn">
          <Upload size={14} /> Restore…
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
      </Row>
      </Group>
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
      <span className="about-mark"><KiteLogo size={64} /></span>
      <h3>Kite</h3>
      <p className="muted">Version 0.1.0</p>
      <p className="about-line">A calm, sidebar-first browser that works fully offline. No account, no server.</p>
      <p className="muted">Made by Mayank Jha · Built with Electron, React and TypeScript</p>
    </div>
  );
}

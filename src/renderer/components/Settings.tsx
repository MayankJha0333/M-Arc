import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Layers, Keyboard, Route, Database, Info, RotateCcw, Upload, Download, Wand2, AlertTriangle, PanelLeft, PanelRight, ShieldCheck, Puzzle, RefreshCw, Trash2, Search, ChevronRight, X, Shapes, LayoutPanelLeft, AudioLines, Plus } from 'lucide-react';
import { siteKey, type Shields } from '@shared/shields';
import type { ShieldsStatus, SitePermission } from '@shared/ipc';
import { ARCHIVE_CHOICES, SEARCH_ENGINES, SHORTCUT_LABELS, DEFAULT_SHORTCUTS, createInitialState } from '@shared/defaults';
import { clearHistory, exportBackup, readBackup, resetAppearance, resetShortcuts, setShortcut, shortcutConflict, updateSettings, LIMITS, type BackupInfo } from '@shared/settings';
import { formatShortcut, shortcutFromEvent } from '@shared/shortcuts';
import type { ID, Settings as S } from '@shared/types';
import { activeSpace } from '@shared/tree';
import { act, getS, setUi, toast, useKite } from '../store';
import { bridge, isMac } from '../platform';
import { Page, Segmented, Group, Row, SwitchRow } from './Sheet';
import { KiteLogo } from './KiteLogo';
import { EMOJIS } from './Spaces';
import { BackgroundStudio } from './BackgroundStudio';
import { createSpace, deleteSpace, updateSpace } from '@shared/spaces';
import { LookBar, LookStudio, setLayout, useDiscardPreviewOnLeave, useEffectiveLook } from './LookStudio';
import { sleepOtherTabs, switchSpaceCmd, undoable } from '../commands';
import { now } from '../platform';
import { playSound } from '../sound';

type Section = 'appearance' | 'spaces' | 'layout' | 'motion' | 'tabs' | 'links' | 'privacy' | 'extensions' | 'keys' | 'data' | 'about';
interface SectionDef {
  id: Section;
  label: string;
  /** One line under the section title. */
  desc: string;
  icon: React.ReactNode;
  /** Extra words the search box matches (what lives in the section). */
  words: string;
}

/**
 * How Settings is organised, by what people come to do (not by how Kite is built):
 * - Personalize: how Kite looks and feels. Whole-window look first, then each Space.
 * - Browsing: how tabs, search and links behave day to day.
 * - Privacy: what's blocked, shared, remembered and cleared, all in one place.
 * - Power tools: extensions, Boosts and shortcuts, for when you want more.
 * - Kite: your data and the app itself; rare and risky things live last.
 * Each page lists its most-used settings first, and anything destructive last.
 */
const GROUPS: { label: string; items: SectionDef[] }[] = [
  {
    label: 'Personalize',
    items: [
      { id: 'appearance', label: 'Appearance', desc: 'Themes, style, accent and text for the whole window', icon: <Palette size={15} />, words: 'theme style accent surfaces borders shadows glass frosted contrast font text size share code css restyle reset readability' },
      { id: 'spaces', label: 'Spaces', desc: 'Name, icon, colours, gradient and animation of each Space', icon: <Shapes size={15} />, words: 'space name icon emoji colour color mode dark light gradient stops angle radial conic mesh linear palette animation animate motion drift swirl spin breathe grain strength logins accounts separate isolated archive delete background wallpaper' },
      { id: 'layout', label: 'Layout', desc: 'Sidebar, spacing, corners and Favorites', icon: <LayoutPanelLeft size={15} />, words: 'sidebar side left right width spacing density compact roomy gap margin corner radius roundness favorites columns address bar url close buttons hover' },
      { id: 'motion', label: 'Motion & Sound', desc: 'Animations, their speed, and interface sounds', icon: <AudioLines size={15} />, words: 'reduce motion animation feel smooth snappy bouncy speed sound sounds volume audio accessibility' },
    ],
  },
  {
    label: 'Browsing',
    items: [
      { id: 'tabs', label: 'Tabs', desc: 'Archiving, memory, Peek and videos', icon: <Layers size={15} />, words: 'archive tabs little window memory sleep awake tidy titles pinned peek shift click video picture floating pop out' },
      { id: 'links', label: 'Search & Links', desc: 'Your search engine, and where links from other apps open', icon: <Route size={15} />, words: 'search engine google duckduckgo kagi bing custom routing default browser links other apps air traffic rules' },
    ],
  },
  {
    label: 'Privacy',
    items: [{ id: 'privacy', label: 'Privacy & Security', desc: 'Shields, connection, permissions, downloads and your data', icon: <ShieldCheck size={15} />, words: 'shields ads trackers cookie banners https gpc global privacy control downloads permissions camera microphone location notifications clear data cache cookies history' }],
  },
  {
    label: 'Power tools',
    items: [
      { id: 'extensions', label: 'Extensions & Boosts', desc: 'Add features to Kite, and restyle the sites you use', icon: <Puzzle size={15} />, words: 'extensions chrome web store boosts restyle hide clutter css' },
      { id: 'keys', label: 'Keyboard', desc: 'Every shortcut, ready to change', icon: <Keyboard size={15} />, words: 'shortcut keys hotkey keyboard' },
    ],
  },
  {
    label: 'Kite',
    items: [
      { id: 'data', label: 'Backup & Import', desc: 'Import from Arc, back up, restore or start over', icon: <Database size={15} />, words: 'import arc backup restore export reset erase start over data' },
      { id: 'about', label: 'About Kite', desc: 'Version and credits', icon: <Info size={15} />, words: 'version about credits' },
    ],
  },
];
const SECTIONS: SectionDef[] = GROUPS.flatMap((g) => g.items);
/** Old links into Settings still land somewhere sensible. */
const ALIASES: Record<string, Section> = { search: 'links', routing: 'links', boosts: 'extensions', shortcuts: 'keys', backup: 'data', colours: 'spaces', background: 'spaces' };

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

const toSection = (arg: string | undefined): Section => (SECTIONS.some((x) => x.id === arg) ? (arg as Section) : arg && ALIASES[arg] ? ALIASES[arg] : 'appearance');

export function SettingsPanel() {
  // The open section lives in the app state, so other parts of Kite can link to one.
  const section = useKite((x) => (x.ui.panel === 'shortcuts' ? 'keys' : toSection(x.ui.panelArg)));
  const setSection = (id: Section) => setUi({ panel: 'settings', panelArg: id });
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchSections(query), [query]);
  const body = useRef<HTMLDivElement>(null);
  // A look preview carries across sections; it's only thrown away when Settings closes.
  useDiscardPreviewOnLeave();
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
      const hit = Array.from(root.querySelectorAll<HTMLElement>('.set-row-title, .set-group-title, .look-h, .key-label, .bg-tile-label')).find((el) => el.textContent?.toLowerCase().includes(q));
      const row = hit?.closest<HTMLElement>('.set-row, .set-group-head, .look-sec, .key-row, .bg-tile') ?? hit;
      if (!row) return;
      root.querySelectorAll('[data-hit]').forEach((el) => el.removeAttribute('data-hit'));
      row.scrollIntoView({ block: 'center', behavior: useKite.getState().s.settings.reduceMotion ? 'auto' : 'smooth' });
      row.setAttribute('data-hit', 'true');
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, section]);
  const def = SECTIONS.find((x) => x.id === section)!;
  const scope = section === 'spaces' ? 'This Space' : section === 'appearance' || section === 'layout' ? 'All Spaces' : null;
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
            {GROUPS.map((g) => {
              const items = g.items.filter((x) => shown.includes(x.id));
              if (!items.length) return null;
              return (
                <div className="settings-navgroup" key={g.label} role="presentation">
                  <div className="settings-navgroup-label" aria-hidden="true">{g.label}</div>
                  {items.map((x) => (
                    <button key={x.id} role="tab" aria-selected={section === x.id} aria-label={x.label} title={x.label} className="settings-tab" data-on={section === x.id || undefined} data-testid={`settings-${x.id}`} onClick={() => setSection(x.id)}>
                      <span className="settings-tab-icon">{x.icon}</span>
                      <span className="settings-tab-label">{x.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
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
              <h2 className="settings-head-title">
                {def.label}
                {scope && <span className="settings-scope" data-testid="settings-scope">{scope}</span>}
              </h2>
              <p className="settings-head-desc">{def.desc}</p>
            </div>
          </header>
          <div className="settings-body" key={section} role="tabpanel" aria-label={def.label}>
            {section === 'appearance' && <Appearance />}
            {section === 'spaces' && <SpacesPage />}
            {section === 'layout' && <LayoutPage />}
            {section === 'motion' && <MotionPage />}
            {section === 'tabs' && <TabsSection />}
            {section === 'links' && <SearchLinks />}
            {section === 'privacy' && <Privacy />}
            {section === 'extensions' && <Extensions />}
            {section === 'keys' && <Keys />}
            {section === 'data' && <Data />}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </Page>
  );
}

const set = (patch: Partial<S>) => act((d) => updateSettings(d, patch));

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
  const [css, setCss] = useState(st.chromeCss);
  useEffect(() => {
    const t = setTimeout(() => css !== getS().settings.chromeCss && set({ chromeCss: css }), 250);
    return () => clearTimeout(t);
  }, [css]);
  return (
    <>
      <LookBar />
      <LookStudio />
      <Group title="Text" desc="Kite's own text. Web pages keep their fonts.">
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
      <Group title="Advanced" desc="Your own CSS for Kite's window. It applies on top of everything above.">
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

/** Everything about one Space in one place: who it is, how it looks, how it behaves. */
function SpacesPage() {
  const spaces = useKite((x) => x.s.spaces);
  const space = useKite((x) => activeSpace(x.s));
  const tabs = useKite((x) => (id: ID) => {
    const sp = x.s.spaces.find((y) => y.id === id);
    return sp ? sp.pinned.length + sp.today.length : 0;
  });
  const choose = (id: ID) => {
    if (id === space.id) return;
    // A background preview belongs to the Space it was made on.
    if (useKite.getState().ui.lookDraft) {
      setUi({ lookDraft: null });
      toast('Background preview discarded (it was for another Space)');
    }
    switchSpaceCmd(id);
  };
  return (
    <>
      <div className="space-picker" role="tablist" aria-label="Choose a Space to edit" data-testid="space-picker">
        {spaces.map((sp) => (
          <button key={sp.id} role="tab" aria-selected={sp.id === space.id} className="space-pick" data-on={sp.id === space.id || undefined} data-testid={`set-space-${sp.id}`} onClick={() => choose(sp.id)}>
            <span className="space-pick-sw" style={{ background: `linear-gradient(135deg, ${sp.theme.colors[0]}, ${sp.theme.colors[1]})` }}>{sp.icon}</span>
            <span className="space-pick-text">
              <span className="space-pick-name">{sp.name}</span>
              <span className="space-pick-meta">{tabs(sp.id)} tab{tabs(sp.id) === 1 ? '' : 's'}</span>
            </span>
          </button>
        ))}
        <button className="space-pick add" data-testid="set-space-new" onClick={() => { if (useKite.getState().ui.lookDraft) setUi({ lookDraft: null }); const id = act((d) => createSpace(d, {})); switchSpaceCmd(id); }}>
          <span className="space-pick-sw"><Plus size={16} /></span>
          <span className="space-pick-text"><span className="space-pick-name">New Space</span></span>
        </button>
      </div>

      <LookBar />
      <BackgroundStudio />

      <Group title="Name & icon">
        <Row title="Name">
          <input key={space.id} className="input" aria-label="Space name" data-testid="set-space-name" defaultValue={space.name} onChange={(e) => act((d) => updateSpace(d, space.id, { name: e.target.value }))} />
        </Row>
        <Row title="Icon" desc="Pick one or type any emoji" stack>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className="emoji" aria-label={`Icon ${e}`} data-on={space.icon === e || undefined} onClick={() => act((d) => updateSpace(d, space.id, { icon: e }))}>
                {e}
              </button>
            ))}
            <input key={`i-${space.id}`} className="input emoji-input" aria-label="Your own icon" maxLength={4} placeholder="✎" data-testid="set-space-icon" onChange={(e) => e.target.value && act((d) => updateSpace(d, space.id, { icon: e.target.value }))} />
          </div>
        </Row>
      </Group>


      <Group title="Behaviour">
        <SwitchRow
          title="Separate logins"
          desc="Its own cookies, sign-ins and site data, so you can use a second account on the same sites. Favorites stay shared."
          checked={!!space.isolated}
          testId="set-space-isolated"
          onChange={(isolated) => {
            act((d) => updateSpace(d, space.id, { isolated }));
            toast(isolated ? `“${space.name}” now has its own logins and cookies. Its tabs reloaded.` : `“${space.name}” shares logins with your other Spaces again. Its tabs reloaded.`);
          }}
        />
        <Row title="Archive unused tabs after" desc="Overrides the setting in Tabs, for this Space only">
          <select
            className="input"
            aria-label="Archive unused tabs in this Space after"
            data-testid="set-space-archive"
            value={space.archiveAfterMs === undefined ? 'global' : String(space.archiveAfterMs)}
            onChange={(e) => act((d) => updateSpace(d, space.id, { archiveAfterMs: e.target.value === 'global' ? undefined : e.target.value === 'null' ? null : Number(e.target.value) }))}
          >
            <option value="global">Same as Tabs setting</option>
            {ARCHIVE_CHOICES.map((c) => <option key={c.label} value={String(c.ms)}>{c.label}</option>)}
          </select>
        </Row>
      </Group>

      {spaces.length > 1 && (
        <div className="danger-zone">
          <b>Delete “{space.name}”</b>
          <span className="muted">Its pinned tabs and folders move to the Archive. You can undo right after.</span>
          <button className="btn small danger" data-testid="set-space-delete" onClick={() => { const name = space.name; const id = space.id; undoable(`Deleted Space “${name}”`, (d) => void deleteSpace(d, id, now())); }}>
            <Trash2 size={13} /> Delete Space
          </button>
        </div>
      )}
    </>
  );
}

function LayoutPage() {
  const st = useEffectiveLook().settings;
  return (
    <>
      <LookBar />
      <Group title="Sidebar">
        <Row title="Side">
          <Segmented testId="set-side" value={st.sidebarSide} onChange={(v) => set({ sidebarSide: v })} options={[{ value: 'left', label: <><PanelLeft size={13} /> Left</> }, { value: 'right', label: <><PanelRight size={13} /> Right</> }]} />
        </Row>
        <Slider k="sidebarWidth" label="Width" testId="set-width" />
        <SwitchRow title="Address bar in the sidebar" checked={st.showUrlBar} onChange={(v) => set({ showUrlBar: v })} testId="set-urlbar" />
        <SwitchRow title="Close buttons on hover" desc="Otherwise only the selected tab shows one" checked={st.showTabCloseOnHover} onChange={(v) => set({ showTabCloseOnHover: v })} testId="set-closehover" />
      </Group>
      <Group title="Spacing & shape" desc="Each style sets these; change them to taste.">
        <Row title="Row height" desc="How tall tabs and rows are">
          <Segmented testId="set-density" value={st.density} onChange={(v) => setLayout({ density: v }, set)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'roomy', label: 'Roomy' }]} />
        </Row>
        <Slider k="gap" label="Space around the page" testId="set-gap" />
        <Slider k="radius" label="Corner roundness" testId="set-radius" />
      </Group>
      <Group title="Favorites">
        <Slider k="favoritesColumns" label="Favorites per row" unit="" testId="set-favcols" />
      </Group>
    </>
  );
}

function MotionPage() {
  const st = useKite((x) => x.s.settings);
  return (
    <>
      <Group title="Motion" desc="How things move. Kite also follows your system's Reduce Motion setting.">
        <SwitchRow title="Reduce motion" desc="Turn off animations and transitions, including moving backgrounds" checked={st.reduceMotion} onChange={(v) => set({ reduceMotion: v })} testId="set-motion" />
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
    </>
  );
}

function archiveValue(ms: number | null) {
  return String(ms);
}

function TabsSection() {
  const st = useKite((x) => x.s.settings);
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
          <input type="range" className="range" aria-label="Tabs kept awake" min={LIMITS.awakeTabs[0]} max={LIMITS.awakeTabs[1]} value={st.awakeTabs} data-testid="set-awake" onChange={(e) => set({ awakeTabs: Number(e.target.value) })} />
        </Row>
        <Row title="Free up memory now" desc="Puts every tab to sleep except the one you're on">
          <button className="btn small" data-testid="set-sleep-now" onClick={(e) => { e.preventDefault(); sleepOtherTabs(); }}>Sleep other tabs</button>
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
    </>
  );
}

function SearchLinks() {
  const st = useKite((x) => x.s.settings);
  const routes = useKite((x) => x.s.routes.length);
  const custom = !SEARCH_ENGINES.some((e) => e.template === st.searchEngine);
  const [tpl, setTpl] = useState(custom ? st.searchEngine : '');
  // The box for your own engine shows only once you pick "Custom…".
  const [ownEngine, setOwnEngine] = useState(custom);
  return (
    <>
      <Group title="Search">
        <Row title="Search engine">
          <select
            className="input"
            aria-label="Search engine"
            value={custom || ownEngine ? 'custom' : st.searchEngine}
            data-testid="set-engine"
            onChange={(e) => {
              const v = e.target.value;
              setOwnEngine(v === 'custom');
              if (v !== 'custom') set({ searchEngine: v });
            }}
          >
            {SEARCH_ENGINES.map((e) => <option key={e.label} value={e.template}>{e.label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </Row>
        {ownEngine && (
        <Row title="Your own search engine" desc="A full https:// address with %s where the words go" stack>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); set({ searchEngine: tpl }); toast(getS().settings.searchEngine === tpl ? 'Search engine saved' : 'Use a full https:// address with %s where the words go'); }}>
            <input className="input" aria-label="Custom search address" placeholder="https://example.com/search?q=%s" value={tpl} data-testid="set-engine-custom" onChange={(e) => setTpl(e.target.value)} />
            <button className="btn">Use</button>
          </form>
        </Row>
        )}
      </Group>
      <Group title="Links from other apps" desc="Choose which Space, or a little window, opens links you click in Mail, Slack and other apps.">
        <button className="set-link" data-testid="settings-open-routing" onClick={() => setUi({ panel: 'routing' })}>
          <span className="import-swatch"><Route size={16} /></span>
          <span className="set-row-text"><span className="set-row-title">Link Routing</span><span className="set-row-desc">{routes} rule{routes === 1 ? '' : 's'} · make Kite your default browser</span></span>
          <ChevronRight size={15} className="set-link-chevron" />
        </button>
      </Group>
    </>
  );
}

function Extensions() {
  const boosts = useKite((x) => x.s.boosts.length);
  return (
    <>
      <Group title="Extensions" desc="Chrome extensions add features to Kite.">
        <button className="set-link" data-testid="settings-open-extensions" onClick={() => setUi({ panel: 'extensions' })}>
          <span className="import-swatch"><Puzzle size={16} /></span>
          <span className="set-row-text"><span className="set-row-title">Manage extensions</span><span className="set-row-desc">Add, turn off or remove extensions</span></span>
          <ChevronRight size={15} className="set-link-chevron" />
        </button>
      </Group>
      <Group title="Boosts" desc="Restyle the sites you use, or hide what you never read. Boosts stay on this computer.">
        <button className="set-link" data-testid="settings-open-boosts" onClick={() => setUi({ panel: 'boosts' })}>
          <span className="import-swatch"><Wand2 size={16} /></span>
          <span className="set-row-text"><span className="set-row-title">Your Boosts</span><span className="set-row-desc">{boosts} Boost{boosts === 1 ? '' : 's'}</span></span>
          <ChevronRight size={15} className="set-link-chevron" />
        </button>
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
        <Row title="Browsing history" desc="What the command bar suggests from">
          <button className="btn small" data-testid="set-clear-history" onClick={() => { act(clearHistory); toast('History cleared'); }}>
            Clear history
          </button>
        </Row>
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

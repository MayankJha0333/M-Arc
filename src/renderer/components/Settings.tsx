import { useEffect, useState } from 'react';
import { Palette, Layers, Keyboard, Route, Database, Info, RotateCcw, Upload, Download, Wand2, AlertTriangle, PanelLeft, PanelRight } from 'lucide-react';
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

type Section = 'appearance' | 'tabs' | 'keys' | 'links' | 'data' | 'about';
const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'tabs', label: 'Tabs & Archive', icon: <Layers size={15} /> },
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
  const v = useKite((st) => st.s.settings[k]) as number;
  const [lo, hi] = LIMITS[k];
  const shown = k === 'fontScale' ? `${Math.round(v * 100)}%` : `${v}${unit}`;
  return (
    <Field label={label} hint={shown}>
      <input type="range" className="range" min={lo} max={hi} step={step} value={v} data-testid={testId} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)} />
    </Field>
  );
}

function Appearance() {
  const st = useKite((x) => x.s.settings);
  const space = useKite((x) => activeSpace(x.s));
  const [css, setCss] = useState(st.chromeCss);
  useEffect(() => {
    const t = setTimeout(() => css !== getS().settings.chromeCss && set({ chromeCss: css }), 250);
    return () => clearTimeout(t);
  }, [css]);
  return (
    <>
      <div className="settings-card" onClick={() => openSpaceEditor(space.id)} role="button" data-testid="settings-space-theme">
        <span className="import-swatch" style={{ background: `linear-gradient(135deg, ${space.theme.colors[0]}, ${space.theme.colors[1]})` }}>{space.icon}</span>
        <span className="import-space-text">
          <b>Colors for “{space.name}”</b>
          <span className="muted">Each Space has its own colors and light/dark mode. Click to change.</span>
        </span>
      </div>
      <div className="field-row">
        <Field label="Sidebar side">
          <Segmented testId="set-side" value={st.sidebarSide} onChange={(v) => set({ sidebarSide: v })} options={[{ value: 'left', label: <><PanelLeft size={13} /> Left</> }, { value: 'right', label: <><PanelRight size={13} /> Right</> }]} />
        </Field>
        <Field label="Spacing">
          <Segmented testId="set-density" value={st.density} onChange={(v) => set({ density: v })} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'roomy', label: 'Roomy' }]} />
        </Field>
      </div>
      <Field label="Font">
        <Segmented
          testId="set-font"
          value={st.font}
          onChange={(v) => set({ font: v })}
          options={[
            { value: 'figtree', label: <span style={{ fontFamily: 'Figtree' }}>Figtree</span> },
            { value: 'bricolage', label: <span style={{ fontFamily: "'Bricolage Grotesque'" }}>Bricolage</span> },
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
      <Field label="Restyle Kite itself" hint="Advanced: your own CSS for Kite’s window">
        <textarea className="input" spellCheck={false} placeholder={'.sidebar { backdrop-filter: blur(20px); }\n.row[data-active] { border-radius: 4px; }'} value={css} data-testid="set-chrome-css" onChange={(e) => setCss(e.target.value)} />
      </Field>
      <button className="btn small" data-testid="set-reset-appearance" onClick={() => { act(resetAppearance); setCss(''); toast('Appearance reset'); }}>
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

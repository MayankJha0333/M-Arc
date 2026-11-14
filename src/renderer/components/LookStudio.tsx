// Settings → Appearance: themes, style, accent and surfaces for the whole window.
// (Each Space's colours, gradient, pattern and animation live in Settings → Spaces.)
// Everything you touch previews live on the whole Kite window; nothing is saved
// until you press Apply (and Apply can be undone). The preview carries across
// Settings pages, so a background and a style can be tried together.

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ClipboardPaste, Sparkles, Undo2, Wand2, Layers } from 'lucide-react';
import { ACCENTS, STYLES, applyLookDraft, decodeTheme, defaultLook, encodeTheme, restoreLook, snapshotLook, styleById, THEMES, themeDraft, matchTheme, type Look, type LookDraft, type StyleId } from '@shared/look';
import { activeSpace } from '@shared/tree';
import type { Settings, SpaceTheme } from '@shared/types';
import { act, getS, setUi, toast, useKite } from '../store';
import { themeVars, resolveDark, readability, readableIntensity } from '../theme';
import { useSystemDark } from '../systemDark';
import { Field, Group, Row, Segmented } from './Sheet';

type LayoutKeys = 'radius' | 'gap' | 'density' | 'font';

/** Merge a change into the look being previewed. */
export function previewLook(patch: LookDraft) {
  setUi((u) => {
    const d = u.lookDraft ?? {};
    return {
      lookDraft: {
        settings: patch.settings ? { ...d.settings, ...patch.settings } : d.settings,
        theme: patch.theme ? { ...d.theme, ...patch.theme } : d.theme,
        allSpaces: patch.allSpaces ?? d.allSpaces,
      },
    };
  });
}

/** The layout settings a style also sets: changed in the preview if one is open, else saved at once. */
export function setLayout(patch: Partial<Pick<Settings, LayoutKeys>>, saveNow: (p: Partial<Settings>) => void) {
  if (useKite.getState().ui.lookDraft) previewLook({ settings: patch });
  else saveNow(patch);
}

/** The settings and Space theme you see right now (saved values plus the preview). */
export function useEffectiveLook() {
  const saved = useKite((x) => x.s.settings);
  const savedTheme = useKite((x) => activeSpace(x.s).theme);
  const draft = useKite((x) => x.ui.lookDraft);
  const settings = useMemo(() => ({ ...saved, ...draft?.settings }), [saved, draft]);
  const theme = useMemo(() => ({ ...savedTheme, ...draft?.theme }), [savedTheme, draft]);
  return { settings, theme, draft };
}

export function applyDraft() {
  const draft = useKite.getState().ui.lookDraft;
  if (!draft) return;
  const s = getS();
  const snap = snapshotLook(s);
  const spaceId = s.activeSpaceId;
  act((d) => applyLookDraft(d, draft, spaceId));
  setUi({ lookDraft: null });
  toast(draft.allSpaces ? 'New look applied to every Space' : 'New look applied', 'Undo', () => act((d) => restoreLook(d, snap)), 9000);
}

const discard = () => setUi({ lookDraft: null });

/** Leaving Settings with an unsaved preview puts things back, with a way to keep it. */
export function useDiscardPreviewOnLeave() {
  useEffect(
    () => () => {
      const left = useKite.getState().ui.lookDraft;
      if (!left) return;
      setUi({ lookDraft: null });
      toast('Look preview closed without applying', 'Apply it', () => {
        setUi({ lookDraft: left });
        applyDraft();
      }, 8000);
    },
    [],
  );
}

/**
 * The bar at the top of every look page: how readable the current look is, and —
 * while something is being previewed — Discard and Apply.
 */
export function LookBar() {
  const { settings, theme, draft } = useEffectiveLook();
  const systemDark = useSystemDark();
  const look = settings.look;
  const read = readability(theme, settings, systemDark);
  const fix = () => {
    const intensity = readableIntensity(theme, settings, systemDark);
    const after = readability({ ...theme, intensity }, settings, systemDark);
    previewLook({ theme: { intensity }, settings: after.ok ? undefined : { look: { ...look, contrast: 'high', accent: null } } });
  };
  return (
    <div className="look-bar" data-dirty={draft ? true : undefined} data-testid="look-bar">
      <span className="look-read" data-ok={read.ok || undefined} data-testid="look-readability" title={`Text on the sidebar ${read.text}:1 (needs 4.5) · Accent ${read.accent}:1 (needs 3)`}>
        {read.ok ? <Check size={13} /> : <Wand2 size={13} />}
        <span>
          Text <b data-testid="look-text-ratio">{read.text}:1</b> · Accent <b>{read.accent}:1</b>
        </span>
        {read.ok ? <span className="look-read-ok">Easy to read</span> : <button className="btn small" data-testid="look-fix" onClick={fix}>Fix it</button>}
      </span>
      <span className="spacer" />
      {draft ? (
        <>
          <span className="look-bar-text"><Sparkles size={14} /> Not saved yet</span>
          <button className="btn small ghost" data-testid="look-discard" onClick={discard}><Undo2 size={13} /> Discard</button>
          <button className="btn small primary" data-testid="look-apply" onClick={applyDraft}><Check size={13} /> Apply</button>
        </>
      ) : (
        <span className="look-bar-text muted">Changes preview live</span>
      )}
    </div>
  );
}

export function LookStudio() {
  const { settings, theme } = useEffectiveLook();
  const space = useKite((x) => activeSpace(x.s));
  const systemDark = useSystemDark();
  const look = settings.look;
  const setLook = (p: Partial<Look>) => previewLook({ settings: { look: { ...look, ...p } } });

  const pickStyle = (id: StyleId) => {
    const d = styleById(id).defaults;
    previewLook({ settings: { look: { ...defaultLook(id), accent: look.accent, contrast: look.contrast }, radius: d.radius, gap: d.gap, density: d.density, font: d.font } });
  };

  const current = matchTheme(look, theme);

  return (
    <div className="look" data-testid="look-studio">
      <section className="look-sec">
        <h3 className="look-h">Themes <span className="muted">ready-made looks; change anything afterwards</span></h3>
        <div className="look-themes" role="radiogroup" aria-label="Theme" data-testid="look-themes">
          {THEMES.map((t) => {
            const d = themeDraft(t, look);
            const on = current?.id === t.id;
            const sampleSettings = { ...settings, ...d.settings } as Settings;
            const sampleTheme = { ...theme, ...d.theme };
            return (
              <button key={t.id} role="radio" aria-checked={on} className="look-theme" data-on={on || undefined} data-testid={`look-theme-${t.id}`} onClick={() => previewLook(d)}>
                <span className="look-theme-pair">
                  <MiniPreview theme={{ ...sampleTheme, mode: 'light' }} settings={sampleSettings} systemDark={false} />
                  <MiniPreview theme={{ ...sampleTheme, mode: 'dark' }} settings={sampleSettings} systemDark={true} />
                </span>
                <span className="look-style-name">{t.name}</span>
                <span className="look-style-tag">{t.note} · {styleById(t.style).name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="look-sec">
        <h3 className="look-h">Style</h3>
        <div className="look-styles" role="radiogroup" aria-label="Style">
          {STYLES.map((st) => {
            const d = st.defaults;
            const sample = st.id === look.style ? settings : { ...settings, look: { ...defaultLook(st.id), accent: look.accent, contrast: look.contrast }, radius: d.radius, gap: d.gap, density: d.density, font: d.font };
            return (
              <button key={st.id} role="radio" aria-checked={look.style === st.id} className="look-style" data-on={look.style === st.id || undefined} data-testid={`look-style-${st.id}`} onClick={() => pickStyle(st.id)}>
                <MiniPreview theme={theme} settings={sample} systemDark={systemDark} />
                <span className="look-style-name">{st.name}</span>
                <span className="look-style-tag">{st.tagline}</span>
                <span className="look-style-mood">{st.mood}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Group title="This Space's colours" desc={`“${space.name}” has its own colours, gradient and animation.`}>
        <Row title={<span className="bg-mini" style={{ background: 'var(--backdrop)' }} aria-hidden="true" />} desc="Light or dark mode, palettes, your own gradient and slow movement">
          <button className="btn small" data-testid="settings-open-background" onClick={() => setUi({ panelArg: 'spaces' })}>
            <Layers size={13} /> Edit background
          </button>
        </Row>
      </Group>

      <section className="look-sec">
        <h3 className="look-h">Accent</h3>
        <div className="look-accents" role="radiogroup" aria-label="Accent colour">
          <button role="radio" aria-checked={look.accent === null} className="look-accent auto" data-on={look.accent === null || undefined} data-testid="look-accent-auto" onClick={() => setLook({ accent: null })} title="From the Space’s colours">
            <span style={{ background: theme.colors[1] }} /> Auto
          </button>
          {ACCENTS.map((c, i) => (
            <button key={c} role="radio" aria-checked={look.accent === c} aria-label={`Accent ${c}`} className="look-accent" data-on={look.accent === c || undefined} data-testid={`look-accent-${i}`} onClick={() => setLook({ accent: c })}>
              <span style={{ background: c }} />
            </button>
          ))}
          <ColorInput testId="look-accent-custom" label="Custom accent" value={look.accent ?? theme.colors[1]} onChange={(c) => setLook({ accent: c })} compact />
        </div>
      </section>

      <section className="look-sec">
        <h3 className="look-h">Surfaces</h3>
        <div className="field-row">
          <Field label="Default background" hint="for Spaces without their own gradient">
            <Segmented testId="look-backdrop" value={look.backdrop} onChange={(v) => setLook({ backdrop: v })} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'mesh', label: 'Mesh' }, { value: 'tint', label: 'Tint' }, { value: 'solid', label: 'Solid' }]} />
          </Field>
          <Field label="Contrast">
            <Segmented testId="look-contrast" value={look.contrast} onChange={(v) => setLook({ contrast: v })} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }]} />
          </Field>
        </div>
        <div className="settings-grid">
          <LookSlider label="Borders" value={look.border} testId="look-border" onChange={(v) => setLook({ border: v })} />
          <LookSlider label="Shadows" value={look.shadow} testId="look-shadow" onChange={(v) => setLook({ shadow: v })} />
          <LookSlider label="Frosted glass" value={look.translucency} testId="look-glass" onChange={(v) => setLook({ translucency: v })} />
        </div>
      </section>

      <ShareTheme settings={settings} theme={theme} />
    </div>
  );
}

function LookSlider({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId: string }) {
  return (
    <Field label={label} hint={`${Math.round(value * 100)}%`}>
      <input type="range" className="range" min={0} max={1} step={0.05} value={value} data-testid={testId} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

/** A colour picker with its hex code you can type or paste. */
export function ColorInput({ value, onChange, label, testId, compact }: { value: string; onChange: (c: string) => void; label: string; testId: string; compact?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => {
    const v = raw.trim().replace(/^#?/, '#').toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) onChange(v);
    else if (/^#[0-9a-f]{3}$/.test(v)) onChange(`#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`);
    else setText(value);
  };
  return (
    <span className="look-color" data-compact={compact || undefined}>
      <input type="color" aria-label={label} value={value} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
      <input className="input look-hex" aria-label={`${label} hex code`} value={text} spellCheck={false} maxLength={7} data-testid={`${testId}-hex`} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)} />
    </span>
  );
}

/** Copy your look as a short code, or paste someone else's to preview it. */
function ShareTheme({ settings, theme }: { settings: Settings; theme: SpaceTheme }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const mine = encodeTheme({ look: settings.look, theme, radius: settings.radius, gap: settings.gap, density: settings.density, font: settings.font });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mine);
      toast('Theme code copied');
    } catch {
      setCode(mine);
      toast('Copy the code from the box');
    }
  };
  const load = () => {
    const t = decodeTheme(code, theme);
    if (!t) return setError('That isn’t a Kite theme code.');
    setError('');
    previewLook({ settings: { look: t.look, radius: t.radius, gap: t.gap, density: t.density, font: t.font }, theme: t.theme });
    toast('Theme loaded — press Apply to keep it');
  };
  return (
    <section className="look-sec">
      <h3 className="look-h">Share</h3>
      <p className="muted">A theme code holds only the look: no tabs, sites or anything personal.</p>
      <div className="look-share">
        <button className="btn small" data-testid="look-copy" onClick={copy}><Copy size={13} /> Copy theme code</button>
        <input className="input" placeholder="Paste a kite-theme: code" value={code} data-testid="look-code" onChange={(e) => { setCode(e.target.value); setError(''); }} />
        <button className="btn small" data-testid="look-load" disabled={!code.trim()} onClick={load}><ClipboardPaste size={13} /> Preview</button>
      </div>
      {error && <p className="look-error" role="alert" data-testid="look-code-error">{error}</p>}
    </section>
  );
}

/** A tiny browser drawn in a given look. */
export function MiniPreview({ theme, settings, systemDark }: { theme: SpaceTheme; settings: Settings; systemDark: boolean }) {
  const vars = useMemo(() => themeVars(theme, settings, systemDark), [theme, settings, systemDark]);
  return (
    <span className="mini" style={vars as React.CSSProperties} data-theme={resolveDark(theme, systemDark) ? 'dark' : 'light'} data-style={settings.look.style} aria-hidden="true">
      <span className="mini-side">
        <span className="mini-dots"><i /><i /><i /></span>
        <span className="mini-url" />
        <span className="mini-favs"><i /><i /><i /></span>
        <span className="mini-row" />
        <span className="mini-row" data-on />
        <span className="mini-row" />
        <span className="mini-row short" />
      </span>
      <span className="mini-card">
        <span className="mini-line wide" />
        <span className="mini-line" />
        <span className="mini-block" />
        <span className="mini-line" />
        <span className="mini-btn" />
      </span>
    </span>
  );
}

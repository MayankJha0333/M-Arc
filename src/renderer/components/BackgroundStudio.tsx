// Settings → Spaces → Background: the gradient and animation behind a Space.
// Everything previews live on the whole window (same preview as Appearance) and is
// kept only when you press Apply.

import { useRef, useState } from 'react';
import { Plus, RotateCcw, Trash2, Globe2, ImagePlus, RefreshCw } from 'lucide-react';
import { PALETTES } from '@shared/look';
import { addStop, gradientFromColors, GRADIENT_KINDS, IMAGE_DEFAULTS, IMAGE_PLACES, MAX_STOPS, MIN_STOPS, MOTIONS, removeStop, type GradientKind, type ImagePlace, type SpaceGradient, type SpaceImage } from '@shared/background';
import type { SpaceTheme } from '@shared/types';
import { toast, useKite } from '../store';
import { addImage, ImageError, useImageUrl } from '../images';
import { mix } from '../theme';
import { Group, Row, Segmented, SwitchRow } from './Sheet';
import { ColorInput, previewLook, useEffectiveLook } from './LookStudio';

export function BackgroundStudio() {
  const { theme, draft } = useEffectiveLook();
  const spaceCount = useKite((x) => x.s.spaces.length);
  const reduceMotion = useKite((x) => x.s.settings.reduceMotion);
  const set = (p: Partial<SpaceTheme>) => previewLook({ theme: p });
  const g = theme.gradient;
  // Changing the gradient also keeps the Space's two main colours in step (they feed the accent).
  const setGradient = (ng: SpaceGradient) => {
    const sorted = [...ng.stops].sort((a, b) => a.at - b.at);
    set({ gradient: ng, colors: [sorted[0].color, sorted[sorted.length - 1].color] });
  };
  const kind: GradientKind | 'simple' = g?.kind ?? 'simple';

  const usePalette = (colors: [string, string]) => {
    if (!g) return set({ colors });
    // Keep your gradient's shape; recolour it from the palette, end to end.
    const n = g.stops.length;
    setGradient({ ...g, stops: g.stops.map((s, i) => ({ ...s, color: mix(colors[0], colors[1], n === 1 ? 0 : i / (n - 1)) })) });
  };

  return (
    <>
      <Group title="Colours" desc="Light or dark, and the colours this Space is painted in.">
        <Row title="Mode">
          <Segmented testId="look-mode" value={theme.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
        <Row title="Palettes" desc="A quick start; fine-tune below" stack>
          <div className="look-palettes">
            {PALETTES.map((p) => {
              const on = !g && p.colors[0] === theme.colors[0].toLowerCase() && p.colors[1] === theme.colors[1].toLowerCase();
              return (
                <button key={p.id} className="look-palette" data-on={on || undefined} data-testid={`look-palette-${p.id}`} aria-pressed={on} title={p.name} onClick={() => usePalette(p.colors)}>
                  <span className="look-palette-sw" style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }} />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row title="Colour strength" value={`${Math.round(theme.intensity * 100)}%`} desc="How strongly the colours show; lower is calmer">
          <input type="range" className="range" aria-label="Colour strength" min={0} max={1} step={0.05} value={theme.intensity} data-testid="look-intensity" onChange={(e) => set({ intensity: Number(e.target.value) })} />
        </Row>
        <SwitchRow title="Film grain" desc="A fine paper-like texture" checked={theme.grain} onChange={(v) => set({ grain: v })} testId="look-grain" />
      </Group>

      <PictureGroup image={theme.image} set={set} />

      <Group
        title="Gradient"
        desc={
          theme.image?.place === 'browser'
            ? 'Your picture covers the gradient right now. It comes back if you remove the picture or show it on the New Tab page only.'
            : '“Simple” uses your two colours with the style’s background. Pick a type to design your own.'
        }
      >
        <Row title="Type" stack>
          <Segmented
            testId="bg-kind"
            value={kind}
            onChange={(v) => (v === 'simple' ? set({ gradient: undefined }) : setGradient({ ...(g ?? gradientFromColors(theme.colors)), kind: v as GradientKind }))}
            options={[{ value: 'simple', label: 'Simple' }, ...GRADIENT_KINDS.map((k) => ({ value: k.id, label: k.label }))]}
          />
        </Row>
        {!g ? (
          <Row title="Colours" desc="Start and end of the background">
            <span className="look-custom">
              {[0, 1].map((i) => (
                <ColorInput key={i} testId={`look-color-${i}`} label={i === 0 ? 'First colour' : 'Second colour'} value={theme.colors[i]} onChange={(c) => set({ colors: (i === 0 ? [c, theme.colors[1]] : [theme.colors[0], c]) as [string, string] })} />
              ))}
            </span>
          </Row>
        ) : (
          <>
            <Row title="Colours" desc={`${g.stops.length} of ${MAX_STOPS}. Drag a stop to move it; click the bar to add one.`} stack>
              <GradientEditor gradient={g} onChange={setGradient} />
            </Row>
            <Row title={g.kind === 'radial' || g.kind === 'mesh' ? 'Light comes from' : 'Angle'} value={`${g.angle}°`}>
              <span className="bg-angle">
                <AngleDial angle={g.angle} />
                <input type="range" className="range" aria-label="Angle" min={0} max={359} value={g.angle} data-testid="bg-angle" onChange={(e) => setGradient({ ...g, angle: Number(e.target.value) })} />
              </span>
            </Row>
          </>
        )}
      </Group>

      <Group title="Animation" desc={reduceMotion ? 'Reduce Motion is on (Motion & Sound), so the background stays still.' : 'Slow movement in the background. It never moves the page or the sidebar, only what is behind them.'}>
        <div className="bg-tiles" data-cols="3" role="radiogroup" aria-label="Animation">
          {MOTIONS.map((m) => {
            const on = (theme.motion?.kind ?? 'none') === m.id;
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={on}
                className="bg-tile"
                data-on={on || undefined}
                data-testid={`bg-motion-${m.id}`}
                title={m.note}
                onClick={() => set({ motion: m.id === 'none' ? undefined : { speed: 1, ...theme.motion, kind: m.id } })}
              >
                <span className="bg-tile-sample bg-motion-sample" data-motion={m.id}>
                  <span className="bg-motion-paint" />
                </span>
                <span className="bg-tile-label">{m.label}</span>
              </button>
            );
          })}
        </div>
        {theme.motion && (
          <>
            <Row title="Speed" value={`${theme.motion.speed}×`}>
              <input type="range" className="range" aria-label="Animation speed" min={0.25} max={3} step={0.25} value={theme.motion.speed} data-testid="bg-motion-speed" onChange={(e) => set({ motion: { ...theme.motion!, speed: Number(e.target.value) } })} />
            </Row>
          </>
        )}
      </Group>

      <Group>
        {spaceCount > 1 && (
          <SwitchRow title={<><Globe2 size={13} /> Use for every Space</>} desc="Apply this background to all your Spaces" label="Use for every Space" checked={!!draft?.allSpaces} onChange={(v) => previewLook({ allSpaces: v })} testId="look-all-spaces" />
        )}
        <Row title="Reset background" desc="Back to Simple, with no animation and no picture">
          <button className="btn small" data-testid="bg-reset" disabled={!g && !theme.motion && !theme.image} onClick={() => set({ gradient: undefined, motion: undefined, image: undefined })}>
            <RotateCcw size={13} /> Reset
          </button>
        </Row>
      </Group>
    </>
  );
}

/** Your own picture as the background: add it, pick where it shows, and soften it. */
function PictureGroup({ image, set }: { image?: SpaceImage; set: (p: Partial<SpaceTheme>) => void }) {
  const src = useImageUrl(image?.id);
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = async (f: File | null | undefined) => {
    if (!f || busy) return;
    setBusy(true);
    try {
      const { id, luma } = await addImage(f);
      const place: ImagePlace = image?.place ?? 'newtab';
      set({ image: { id, luma, place, dim: image?.dim ?? IMAGE_DEFAULTS[place].dim, blur: image?.blur ?? 0 } });
    } catch (e) {
      toast(e instanceof ImageError ? e.message : 'Kite couldn’t add that picture.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const update = (p: Partial<SpaceImage>) => image && set({ image: { ...image, ...p } });
  const setPlace = (place: ImagePlace) => {
    if (!image) return;
    // Untouched dimming follows the place's own starting value (the sidebar needs more).
    const dim = image.dim === IMAGE_DEFAULTS[image.place].dim ? IMAGE_DEFAULTS[place].dim : image.dim;
    update({ place, dim });
  };
  const choose = () => file.current?.click();

  return (
    <Group title="Picture" desc="Use your own picture behind the New Tab page, or behind the whole browser.">
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
        hidden
        data-testid="bg-image-input"
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <div
        className="bg-picture"
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
      >
        {image && src ? (
          <div
            className="bg-photo"
            data-testid="bg-image-preview"
            data-busy={busy || undefined}
            style={{ '--img': `url("${src}")`, '--img-dim': `${Math.round(image.dim * 100)}%`, '--img-blur-s': `${Math.round(image.blur / 3)}px` } as React.CSSProperties}
          >
            <span className="bg-photo-actions">
              <button className="btn small" data-testid="bg-image-replace" onClick={choose} disabled={busy}>
                <RefreshCw size={13} /> {busy ? 'Adding…' : 'Replace'}
              </button>
              <button className="btn small" data-testid="bg-image-remove" onClick={() => set({ image: undefined })} disabled={busy}>
                <Trash2 size={13} /> Remove
              </button>
            </span>
          </div>
        ) : (
          <button className="bg-drop" data-over={over || undefined} data-testid="bg-image-upload" onClick={choose} disabled={busy}>
            <span className="bg-drop-icon">
              <ImagePlus size={20} />
            </span>
            <span className="bg-drop-title">{busy ? 'Adding your picture…' : 'Upload a picture'}</span>
            <span className="bg-drop-note">Or drop one here. JPG, PNG, WebP or GIF, up to 40 MB.</span>
          </button>
        )}
      </div>
      {image && (
        <>
          <Row title="Show on" desc={IMAGE_PLACES.find((p) => p.id === image.place)?.note}>
            <Segmented testId="bg-image-place" value={image.place} onChange={(v) => setPlace(v as ImagePlace)} options={IMAGE_PLACES.map((p) => ({ value: p.id, label: p.label }))} />
          </Row>
          <Row title="Dim" value={`${Math.round(image.dim * 100)}%`} desc="Lays the background colour over it so text stays easy to read">
            <input type="range" className="range" aria-label="Dim the picture" min={0} max={0.8} step={0.05} value={image.dim} data-testid="bg-image-dim" onChange={(e) => update({ dim: Number(e.target.value) })} />
          </Row>
          <Row title="Blur" value={image.blur ? `${image.blur}px` : 'Off'} desc="Softens a busy picture">
            <input type="range" className="range" aria-label="Blur the picture" min={0} max={30} step={2} value={image.blur} data-testid="bg-image-blur" onChange={(e) => update({ blur: Number(e.target.value) })} />
          </Row>
        </>
      )}
    </Group>
  );
}

/** A bar of the gradient with a handle per stop: drag to move, click the bar to add. */
function GradientEditor({ gradient, onChange }: { gradient: SpaceGradient; onChange: (g: SpaceGradient) => void }) {
  const [sel, setSel] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const stops = gradient.stops;
  const i = Math.min(sel, stops.length - 1);
  const ordered = [...stops].sort((a, b) => a.at - b.at);
  const css = `linear-gradient(90deg, ${ordered.map((s) => `${s.color} ${s.at}%`).join(', ')})`;
  const posAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const moveStop = (idx: number, at: number) => onChange({ ...gradient, stops: stops.map((s, k) => (k === idx ? { ...s, at } : s)) });
  /** Settle the order after a move, keeping the same stop selected. */
  const settle = (idx: number) => {
    const moved = stops[idx];
    const next = [...stops].sort((a, b) => a.at - b.at);
    onChange({ ...gradient, stops: next });
    setSel(next.indexOf(moved));
  };
  const colourAt = (at: number) => {
    const before = [...ordered].reverse().find((s) => s.at <= at) ?? ordered[0];
    const after = ordered.find((s) => s.at >= at) ?? ordered[ordered.length - 1];
    return after.at === before.at ? before.color : mix(before.color, after.color, (at - before.at) / (after.at - before.at));
  };
  const addAt = (at: number) => {
    if (stops.length >= MAX_STOPS) return;
    const next = [...stops, { color: colourAt(at), at }].sort((a, b) => a.at - b.at);
    onChange({ ...gradient, stops: next });
    setSel(next.findIndex((s) => s.at === at));
  };
  return (
    <div className="grad-editor">
      <div
        ref={bar}
        className="grad-bar"
        style={{ background: css }}
        data-testid="bg-bar"
        onPointerDown={(e) => {
          if (e.target === bar.current) addAt(posAt(e.clientX));
        }}
      >
        {stops.map((s, k) => (
          <button
            key={k}
            className="grad-stop"
            data-on={k === i || undefined}
            data-testid={`bg-stop-${k}`}
            style={{ left: `${s.at}%`, background: s.color }}
            aria-label={`Colour stop ${k + 1} at ${s.at}%`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel(k);
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) moveStop(k, posAt(e.clientX));
            }}
            onPointerUp={() => settle(k)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                moveStop(k, Math.max(0, Math.min(100, s.at + (e.key === 'ArrowLeft' ? -step : step))));
              }
              if ((e.key === 'Delete' || e.key === 'Backspace') && stops.length > MIN_STOPS) {
                onChange(removeStop(gradient, k));
                setSel(0);
              }
            }}
            onKeyUp={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && settle(k)}
          />
        ))}
      </div>
      <div className="grad-stop-edit">
        <ColorInput testId="bg-stop-color" label={`Colour of stop ${i + 1}`} value={stops[i].color} onChange={(c) => onChange({ ...gradient, stops: stops.map((s, k) => (k === i ? { ...s, color: c } : s)) })} />
        <span className="grad-stop-at">at {stops[i].at}%</span>
        <span className="spacer" />
        <button className="btn small" data-testid="bg-add-stop" disabled={stops.length >= MAX_STOPS} onClick={() => { const next = addStop(gradient, (a, b) => mix(a, b, 0.5)); onChange(next); setSel(next.stops.length - 1 > i ? next.stops.findIndex((s) => !stops.includes(s)) : i); }}>
          <Plus size={13} /> Add colour
        </button>
        <button className="btn small ghost" data-testid="bg-stop-remove" disabled={stops.length <= MIN_STOPS} aria-label="Remove this colour" title="Remove this colour" onClick={() => { onChange(removeStop(gradient, i)); setSel(Math.max(0, i - 1)); }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/** A small dial that shows the angle at a glance. */
function AngleDial({ angle }: { angle: number }) {
  return (
    <span className="angle-dial" aria-hidden="true">
      <span className="angle-dial-hand" style={{ transform: `rotate(${angle}deg)` }} />
    </span>
  );
}

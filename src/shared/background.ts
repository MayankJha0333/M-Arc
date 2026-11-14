// A Space's background: a gradient you design (type, angle, 2–5 colour stops)
// and an optional slow animation.
//
// Everything is optional on the Space theme: with no custom gradient, Kite draws
// the background from the Space's two colours and the style's backdrop, as before.
// Pure and tested; the renderer turns it into CSS.

export type GradientKind = 'linear' | 'radial' | 'conic' | 'mesh';
export interface GradientStop {
  color: string;
  /** Position along the gradient, 0–100. */
  at: number;
}
export interface SpaceGradient {
  kind: GradientKind;
  /** Direction in degrees (linear, conic) or where the light comes from (radial, mesh). */
  angle: number;
  stops: GradientStop[];
}

export type MotionKind = 'none' | 'drift' | 'swirl' | 'spin' | 'breathe' | 'hue';
export interface SpaceMotion {
  kind: MotionKind;
  /** 0.25–3: 1 is the calm default; higher is faster. */
  speed: number;
}

export const GRADIENT_KINDS: { id: GradientKind; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
  { id: 'conic', label: 'Conic' },
  { id: 'mesh', label: 'Mesh' },
];

export const MOTIONS: { id: MotionKind; label: string; note: string }[] = [
  { id: 'none', label: 'Still', note: 'No movement' },
  { id: 'drift', label: 'Drift', note: 'Colours slowly wander' },
  { id: 'swirl', label: 'Swirl', note: 'A gentle back-and-forth turn' },
  { id: 'spin', label: 'Spin', note: 'One slow full turn, on repeat' },
  { id: 'breathe', label: 'Breathe', note: 'Softly grows and settles' },
  { id: 'hue', label: 'Shift', note: 'Colours drift around the wheel' },
];

export const MAX_STOPS = 5;
export const MIN_STOPS = 2;
export const DEFAULT_MOTION: SpaceMotion = { kind: 'none', speed: 1 };

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

/** A starting gradient made from a Space's two colours (what Kite draws by default). */
export function gradientFromColors(colors: [string, string]): SpaceGradient {
  return { kind: 'linear', angle: 165, stops: [{ color: colors[0], at: 0 }, { color: colors[1], at: 100 }] };
}

/** Stops in order, inside 0–100, 2 to 5 of them, valid colours only. */
export function sanitizeGradient(g: unknown): SpaceGradient | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const o = g as Partial<SpaceGradient>;
  const kind = GRADIENT_KINDS.some((k) => k.id === o.kind) ? (o.kind as GradientKind) : 'linear';
  const stops = Array.isArray(o.stops)
    ? o.stops
        .filter((s): s is GradientStop => !!s && isHex((s as GradientStop).color))
        .map((s) => ({ color: s.color.toLowerCase(), at: Math.round(num(s.at, 0, 100, 0)) }))
        .slice(0, MAX_STOPS)
        .sort((a, b) => a.at - b.at)
    : [];
  if (stops.length < MIN_STOPS) return undefined;
  return { kind, angle: Math.round(((num(o.angle, -3600, 3600, 165) % 360) + 360) % 360), stops };
}

export function sanitizeMotion(m: unknown): SpaceMotion | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const o = m as Partial<SpaceMotion>;
  const kind = MOTIONS.some((k) => k.id === o.kind) ? (o.kind as MotionKind) : 'none';
  if (kind === 'none') return undefined;
  return { kind, speed: num(o.speed, 0.25, 3, 1) };
}

/** Add a stop halfway into the widest gap, coloured between its neighbours. */
export function addStop(g: SpaceGradient, mixColors: (a: string, b: string) => string): SpaceGradient {
  if (g.stops.length >= MAX_STOPS) return g;
  const s = [...g.stops].sort((a, b) => a.at - b.at);
  let gap = 0;
  let at = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i].at - s[i - 1].at > gap) {
      gap = s[i].at - s[i - 1].at;
      at = i;
    }
  }
  const stop = { color: mixColors(s[at - 1].color, s[at].color), at: Math.round((s[at - 1].at + s[at].at) / 2) };
  return { ...g, stops: [...s.slice(0, at), stop, ...s.slice(at)] };
}

export function removeStop(g: SpaceGradient, index: number): SpaceGradient {
  if (g.stops.length <= MIN_STOPS) return g;
  return { ...g, stops: g.stops.filter((_, i) => i !== index) };
}

/** Where a radial or mesh light sits for a given angle: on the edge, 0° = top. */
function anglePoint(angle: number): [number, number] {
  const r = (angle * Math.PI) / 180;
  return [Math.round(50 + 50 * Math.sin(r)), Math.round(50 - 50 * Math.cos(r))];
}

/**
 * CSS for a gradient. `paint` turns each stop colour into what's drawn (Kite mixes it
 * with the style's base colour so text stays readable); `alpha` makes see-through blobs.
 */
export function gradientCss(g: SpaceGradient, paint: (c: string) => string, alpha: (c: string, a: number) => string, base: string): string {
  const stops = g.stops.map((s) => `${paint(s.color)} ${s.at}%`).join(', ');
  switch (g.kind) {
    case 'radial': {
      const [x, y] = anglePoint(g.angle);
      return `radial-gradient(140% 140% at ${x}% ${y}%, ${stops})`;
    }
    case 'conic':
      return `conic-gradient(from ${g.angle}deg at 50% 50%, ${stops}, ${paint(g.stops[0].color)} 100%)`;
    case 'mesh': {
      // One soft light per colour, spread around the window, over the first colour.
      const n = g.stops.length;
      const blobs = g.stops.map((s, i) => {
        const [x, y] = anglePoint(g.angle + (360 / n) * i);
        return `radial-gradient(85% 85% at ${x}% ${y}%, ${alpha(paint(s.color), 0.95)} 0%, transparent 70%)`;
      });
      return [...blobs, base].join(', ');
    }
    default:
      return `linear-gradient(${g.angle}deg, ${stops})`;
  }
}

/** Seconds for one cycle of a motion at a speed. Slow by default: background, not show. */
export function motionSeconds(m: SpaceMotion): number {
  const base: Record<MotionKind, number> = { none: 0, drift: 24, swirl: 30, spin: 60, breathe: 16, hue: 40 };
  return Math.round((base[m.kind] / m.speed) * 10) / 10;
}

// Keyboard shortcut strings like "mod+shift+t".
// "mod" means ⌘ on macOS and Ctrl elsewhere.

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code?: string;
}

interface Parsed {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

const ALIASES: Record<string, string> = {
  plus: '=',
  esc: 'escape',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  space: ' ',
};

export function parseShortcut(s: string): Parsed | null {
  if (!s) return null;
  const parts = s.toLowerCase().split('+');
  // "mod+shift+=" splits fine; "mod++" means the + key
  const out: Parsed = { mod: false, ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '' && i === parts.length - 1) { out.key = '+'; continue; }
    if (p === 'mod') out.mod = true;
    else if (p === 'ctrl' || p === 'control') out.ctrl = true;
    else if (p === 'alt' || p === 'option' || p === 'opt') out.alt = true;
    else if (p === 'shift') out.shift = true;
    else if (p === 'cmd' || p === 'meta' || p === 'command') out.meta = true;
    else out.key = ALIASES[p] ?? p;
  }
  return out.key ? out : null;
}

/** Map shifted symbols back to their base key so "mod+shift+=" matches "+" presses. */
const SHIFTED: Record<string, string> = { '+': '=', '_': '-', '{': '[', '}': ']', '<': ',', '>': '.', '?': '/', ':': ';', '"': "'", '|': '\\', '~': '`' };
const CODE_KEYS: Record<string, string> = { Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`' };

function eventKey(e: KeyLike): string {
  if (e.code) {
    if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
    if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
    if (CODE_KEYS[e.code]) return CODE_KEYS[e.code];
  }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return SHIFTED[k] ?? k;
}

export function matchesShortcut(e: KeyLike, shortcut: string, isMac: boolean): boolean {
  const p = parseShortcut(shortcut);
  if (!p) return false;
  const wantMeta = p.meta || (p.mod && isMac);
  const wantCtrl = p.ctrl || (p.mod && !isMac);
  if (e.metaKey !== wantMeta) return false;
  if (e.ctrlKey !== wantCtrl) return false;
  if (e.altKey !== p.alt) return false;
  if (e.shiftKey !== p.shift) return false;
  return eventKey(e) === p.key;
}

/** Find which action a key press triggers. */
export function findAction(e: KeyLike, shortcuts: Record<string, string>, isMac: boolean): string | null {
  for (const [action, combo] of Object.entries(shortcuts)) {
    if (combo && matchesShortcut(e, combo, isMac)) return action;
  }
  return null;
}

/** Build a shortcut string from a key press (used when the user records a new shortcut). */
export function shortcutFromEvent(e: KeyLike, isMac: boolean): string | null {
  const key = eventKey(e);
  if (['meta', 'control', 'alt', 'shift'].includes(key)) return null;
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('mod');
  if (isMac && e.ctrlKey) parts.push('ctrl');
  if (!isMac && e.metaKey) parts.push('meta');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (parts.length === 0 && !/^f\d+$/.test(key)) return null; // plain keys would clash with typing
  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
const KEY_NAMES: Record<string, string> = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', tab: 'Tab', enter: '↩', backspace: '⌫', ' ': 'Space' };

/** "mod+shift+t" → "⇧⌘T" on Mac, "Ctrl+Shift+T" elsewhere. */
export function formatShortcut(s: string, isMac: boolean): string {
  const p = parseShortcut(s);
  if (!p) return '';
  const key = KEY_NAMES[p.key] ?? p.key.toUpperCase();
  if (isMac) {
    return `${p.ctrl ? '⌃' : ''}${p.alt ? '⌥' : ''}${p.shift ? '⇧' : ''}${p.mod || p.meta ? '⌘' : ''}${key}`;
  }
  const mods = [p.mod || p.ctrl ? 'Ctrl' : '', p.meta ? 'Win' : '', p.alt ? 'Alt' : '', p.shift ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

export { MAC_SYMBOLS };

/** Electron accelerator format for globalShortcut ("mod+alt+n" → "CommandOrControl+Alt+N"). */
export function toAccelerator(s: string): string | null {
  const p = parseShortcut(s);
  if (!p) return null;
  const parts: string[] = [];
  if (p.mod) parts.push('CommandOrControl');
  if (p.meta) parts.push('Super');
  if (p.ctrl) parts.push('Control');
  if (p.alt) parts.push('Alt');
  if (p.shift) parts.push('Shift');
  const named: Record<string, string> = { arrowleft: 'Left', arrowright: 'Right', arrowup: 'Up', arrowdown: 'Down', ' ': 'Space', escape: 'Escape', '=': '=', '-': '-' };
  parts.push(named[p.key] ?? p.key.toUpperCase());
  return parts.join('+');
}

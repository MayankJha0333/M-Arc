import { DEFAULT_THEME_ID, defaultLook, THEMES } from './look';
import { defaultShields } from './shields';
import type { AppState, Settings, Space, SpaceTheme } from './types';
import { newId } from './ids';

export const STATE_VERSION = 1;

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Choices offered in Settings for auto-archive. null = never. */
export const ARCHIVE_CHOICES: { label: string; ms: number | null }[] = [
  { label: '1 hour', ms: HOUR },
  { label: '6 hours', ms: 6 * HOUR },
  { label: '12 hours', ms: 12 * HOUR },
  { label: '24 hours', ms: DAY },
  { label: '7 days', ms: 7 * DAY },
  { label: '30 days', ms: 30 * DAY },
  { label: 'Never', ms: null },
];

/** Every action that can have a keyboard shortcut. "mod" = ⌘ on Mac, Ctrl elsewhere. */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  commandBar: 'mod+t',
  editUrl: 'mod+l',
  closeTab: 'mod+w',
  reopenClosed: 'mod+shift+t',
  togglePin: 'mod+d',
  toggleSidebar: 'mod+s',
  newNote: 'mod+shift+o',
  newFolder: 'mod+alt+f',
  newSplit: 'mod+shift+=',
  copyUrl: 'mod+shift+c',
  reload: 'mod+r',
  back: 'mod+[',
  forward: 'mod+]',
  nextSpace: 'mod+alt+arrowright',
  prevSpace: 'mod+alt+arrowleft',
  nextTab: 'ctrl+tab',
  prevTab: 'ctrl+shift+tab',
  settings: 'mod+,',
  archivePage: 'mod+y',
  boostEditor: 'mod+alt+b',
  littleWindow: 'mod+alt+n',
  findInPage: 'mod+f',
  zoomIn: 'mod+=',
  zoomOut: 'mod+-',
  popOutVideo: 'mod+shift+p',
  downloadsPanel: 'mod+shift+j',
};

export const SHORTCUT_LABELS: Record<string, string> = {
  commandBar: 'Open command bar / new tab',
  editUrl: 'Edit current URL',
  closeTab: 'Close tab',
  reopenClosed: 'Reopen closed tab',
  togglePin: 'Pin / unpin tab',
  toggleSidebar: 'Show / hide sidebar',
  newNote: 'New note',
  newFolder: 'New folder',
  newSplit: 'Add page to split view',
  copyUrl: 'Copy URL',
  reload: 'Reload page',
  back: 'Go back',
  forward: 'Go forward',
  nextSpace: 'Next Space',
  prevSpace: 'Previous Space',
  nextTab: 'Next tab',
  prevTab: 'Previous tab',
  settings: 'Open settings',
  archivePage: 'Open Archive',
  boostEditor: 'Boost this site',
  littleWindow: 'New little window',
  findInPage: 'Find in page',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  popOutVideo: 'Pop out / bring back video',
  downloadsPanel: 'Open Downloads',
};

export const SEARCH_ENGINES: { label: string; template: string }[] = [
  { label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { label: 'Google', template: 'https://www.google.com/search?q=%s' },
  { label: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { label: 'Brave Search', template: 'https://search.brave.com/search?q=%s' },
  { label: 'Kagi', template: 'https://kagi.com/search?q=%s' },
];

export function defaultSettings(): Settings {
  return {
    look: defaultLook('calm'),
    sidebarSide: 'left',
    sidebarWidth: 264,
    sidebarCollapsed: false,
    density: 'comfortable',
    font: 'figtree',
    fontScale: 1,
    radius: 12,
    gap: 8,
    showUrlBar: true,
    showTabCloseOnHover: true,
    favoritesColumns: 4,
    awakeTabs: 10,
    archiveAfterMs: 12 * HOUR,
    littleArchiveAfterMs: 12 * HOUR,
    searchEngine: SEARCH_ENGINES[0].template,
    peekOnExternalLinksFromPinned: true,
    peekOnShiftClick: true,
    externalLinksTarget: 'little',
    littleHotkey: 'mod+alt+n',
    boostsEnabled: true,
    autoPip: true,
    autoPipOnAppSwitch: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    chromeCss: '',
    reduceMotion: false,
    tidyTitles: true,
    sounds: true,
    soundVolume: 0.4,
    motionSpeed: 1,
    motionFeel: 'style',
    shields: defaultShields(),
    httpsOnly: true,
    sendGpc: true,
    askWhereToSave: false,
  };
}

/** Ready-made color pairs offered in the Space theme editor. */
export const THEME_PRESETS: { name: string; colors: [string, string] }[] = [
  { name: 'Dune', colors: ['#f2c9a0', '#e58f65'] },
  { name: 'Lagoon', colors: ['#9fd8d0', '#4f8fbf'] },
  { name: 'Moss', colors: ['#c9dcae', '#6f9a72'] },
  { name: 'Plum', colors: ['#e3b7d1', '#8f6aa8'] },
  { name: 'Slate', colors: ['#c8ced8', '#6b7486'] },
  { name: 'Ember', colors: ['#ffb199', '#d64545'] },
  { name: 'Citrus', colors: ['#fbe38e', '#f29e4c'] },
  { name: 'Night', colors: ['#3a4256', '#141824'] },
];

export function defaultTheme(index = 0): SpaceTheme {
  const preset = THEME_PRESETS[index % THEME_PRESETS.length];
  return { colors: [...preset.colors] as [string, string], mode: 'system', intensity: 0.55, grain: true };
}

export function makeSpace(name: string, icon: string, themeIndex = 0): Space {
  return { id: newId('space'), name, icon, theme: defaultTheme(themeIndex), pinned: [], today: [], archiveAfterMs: undefined };
}

export function createInitialState(): AppState {
  const home = makeSpace('Home', '🪁', 0);
  // New copies of Kite start on the default theme (existing data keeps its own colours).
  const start = THEMES.find((t) => t.id === DEFAULT_THEME_ID);
  if (start) home.theme = { colors: [...start.colors] as [string, string], mode: 'system', intensity: start.intensity, grain: start.grain };
  return {
    version: STATE_VERSION,
    items: {},
    spaces: [home],
    favorites: [],
    activeSpaceId: home.id,
    activeBySpace: { [home.id]: null },
    archive: [],
    history: [],
    boosts: [],
    routes: [],
    settings: defaultSettings(),
    closed: [],
  };
}

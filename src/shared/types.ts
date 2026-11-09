// Kite's whole saved state. Everything here is plain JSON so it can be
// written to disk as-is and checked by tests without a browser.

export type ID = string;

export interface TabItem {
  id: ID;
  kind: 'tab';
  url: string;
  title: string;
  favicon?: string;
  /** Pinned/Favorite tabs remember their "home" URL so you can go back to it. */
  homeUrl?: string;
  /** Custom name the user gave this tab (wins over the page title). */
  customTitle?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface FolderItem {
  id: ID;
  kind: 'folder';
  title: string;
  children: ID[];
  collapsed: boolean;
  createdAt: number;
}

export interface NoteItem {
  id: ID;
  kind: 'note';
  title: string;
  /** Rich text stored as HTML produced by the note editor. */
  html: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
}

export type SplitOrientation = 'row' | 'column';

export interface SplitItem {
  id: ID;
  kind: 'split';
  /** 2–4 tab ids shown side by side. These tabs are owned by the split. */
  panes: ID[];
  orientation: SplitOrientation;
  /** Fraction of space per pane; always sums to 1. */
  sizes: number[];
  /** Which pane has focus. */
  focused: number;
  createdAt: number;
  lastActiveAt: number;
}

export type Item = TabItem | FolderItem | NoteItem | SplitItem;
export type ItemKind = Item['kind'];

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SpaceTheme {
  /** Two colors blended into the sidebar background. */
  colors: [string, string];
  mode: ThemeMode;
  /** 0–1, how strongly the colors tint the chrome. */
  intensity: number;
  grain: boolean;
}

export interface Space {
  id: ID;
  name: string;
  icon: string; // an emoji or single character
  theme: SpaceTheme;
  /** Top-level pinned items (tabs, folders, notes, splits). */
  pinned: ID[];
  /** Top-level unpinned items ("Today"), newest first. */
  today: ID[];
  /** Overrides the global auto-archive time for this Space. */
  archiveAfterMs?: number | null;
}

export interface ArchiveEntry {
  id: ID;
  title: string;
  url: string;
  kind: 'tab' | 'note';
  /** Kept for notes so they can be restored with content. */
  html?: string;
  spaceId: ID;
  archivedAt: number;
  reason: 'auto' | 'manual' | 'cleared';
}

export interface HistoryEntry {
  url: string;
  title: string;
  visits: number;
  lastVisitAt: number;
}

export interface Boost {
  id: ID;
  name: string;
  /** Host this Boost applies to, e.g. "news.ycombinator.com". Subdomains match too. */
  domain: string;
  enabled: boolean;
  css: string;
  js: string;
  /** CSS selectors of elements hidden with the zap tool. */
  zaps: string[];
  /** Optional font override for the whole page. */
  font?: string;
  createdAt: number;
  updatedAt: number;
}

export type RouteMatchType = 'host' | 'contains' | 'prefix';

export type RouteTarget =
  | { type: 'space'; spaceId: ID }
  | { type: 'little' }
  | { type: 'active' };

export interface RouteRule {
  id: ID;
  matchType: RouteMatchType;
  value: string;
  target: RouteTarget;
  enabled: boolean;
}

export type SidebarSide = 'left' | 'right';
export type Density = 'compact' | 'comfortable' | 'roomy';
export type FontChoice = 'figtree' | 'bricolage' | 'inter' | 'system' | 'mono';

export interface Settings {
  sidebarSide: SidebarSide;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  density: Density;
  font: FontChoice;
  fontScale: number; // 0.85 – 1.25
  radius: number; // px corner radius of the page card
  gap: number; // px space around the page card
  showUrlBar: boolean;
  showTabCloseOnHover: boolean;
  favoritesColumns: number;
  /** How many tabs keep their page loaded; older ones sleep to save memory. */
  awakeTabs: number;
  /** null = never */
  archiveAfterMs: number | null;
  littleArchiveAfterMs: number | null;
  searchEngine: string; // template with %s
  peekOnExternalLinksFromPinned: boolean;
  peekOnShiftClick: boolean;
  externalLinksTarget: 'little' | 'active';
  littleHotkey: string;
  boostsEnabled: boolean;
  /** Pop playing videos out into a floating window when you switch tabs. */
  autoPip: boolean;
  /** …and when you switch to another app. */
  autoPipOnAppSwitch: boolean;
  shortcuts: Record<string, string>;
  /** Extra CSS the user writes to restyle Kite itself. */
  chromeCss: string;
  reduceMotion: boolean;
  tidyTitles: boolean;
  /** Visual style and its fine-tuning (see shared/look.ts). */
  look: import('./look').Look;
}

export interface AppState {
  version: number;
  items: Record<ID, Item>;
  spaces: Space[];
  favorites: ID[];
  activeSpaceId: ID;
  /** Last selected item per Space. */
  activeBySpace: Record<ID, ID | null>;
  archive: ArchiveEntry[];
  history: HistoryEntry[];
  boosts: Boost[];
  routes: RouteRule[];
  settings: Settings;
  /** Recently closed tabs (newest first) for "reopen closed tab". */
  closed: { item: Item; spaceId: ID; list: 'pinned' | 'today' | 'favorites'; parentId?: ID; index: number }[];
}

/** Where an item lives inside a Space (or the global Favorites). */
export type ListName = 'pinned' | 'today' | 'favorites';

export interface Location {
  list: ListName;
  spaceId: ID | null; // null for favorites
  parentId: ID | null; // folder id, or null for top-level
  index: number;
}

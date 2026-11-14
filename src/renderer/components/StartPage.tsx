// The start page: what a new tab shows (and what Kite shows with nothing open).
//
// Hierarchy, top to bottom: a quiet greeting, the search box (the reason the page
// exists, with the Kite mark inside it), then your Favorites and the sites you visit
// most as tiles with friendly names. Shortcut hints sit in a footer, out of the way.
// What you open replaces this new tab, like any browser's new-tab page.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { formatShortcut } from '@shared/shortcuts';
import type { HistoryEntry, ID, Item } from '@shared/types';
import * as ops from '@shared/ops';
import { displayUrl, hostOf, isNewTabUrl, normalizeInput } from '@shared/url';
import { act, useKite } from '../store';
import { navigateTab, openUrl, selectItem } from '../commands';
import { isMac, now } from '../platform';
import { KiteLogo } from './KiteLogo';
import { SiteIcon } from './SiteIcon';

const MAX_TILES = 8;
const MAX_SUGGESTIONS = 6;

type TabItem = Extract<Item, { kind: 'tab' }>;

/** Names people actually call popular sites (the address alone gets these wrong). */
const KNOWN: Record<string, string> = {
  'mail.google.com': 'Gmail', 'docs.google.com': 'Docs', 'drive.google.com': 'Drive', 'calendar.google.com': 'Calendar', 'meet.google.com': 'Meet', 'maps.google.com': 'Maps',
  'news.ycombinator.com': 'Hacker News', 'youtube.com': 'YouTube', 'github.com': 'GitHub', 'gitlab.com': 'GitLab', 'linkedin.com': 'LinkedIn', 'x.com': 'X',
  'twitter.com': 'X', 'chatgpt.com': 'ChatGPT', 'claude.ai': 'Claude', 'figma.com': 'Figma', 'notion.so': 'Notion', 'web.whatsapp.com': 'WhatsApp',
  'en.wikipedia.org': 'Wikipedia', 'stackoverflow.com': 'Stack Overflow', 'reddit.com': 'Reddit', 'netflix.com': 'Netflix', 'amazon.com': 'Amazon', 'amazon.in': 'Amazon',
};

/** A short, human name for a site: a known name, its own short title, or its name from the address. */
export function siteName(url: string, title?: string): string {
  const host = hostOf(url).replace(/^www\./, '');
  if (KNOWN[host]) return KNOWN[host];
  const t = (title ?? '').trim();
  if (t && t.length <= 22 && !/[./:]/.test(t)) return t;
  const parts = host.split('.');
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || url;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Sites you visit most, skipping ones already in Favorites. */
function frequentSites(history: HistoryEntry[], skip: Set<string>): HistoryEntry[] {
  return [...history]
    .filter((h) => /^https?:/i.test(h.url) && !skip.has(hostOf(h.url)))
    .sort((a, b) => b.visits - a.visits || b.lastVisitAt - a.lastVisitAt)
    .filter((h, i, all) => all.findIndex((x) => hostOf(x.url) === hostOf(h.url)) === i)
    .slice(0, MAX_TILES);
}

export function StartPage({ tabId }: { tabId?: ID }) {
  const sc = useKite((st) => st.s.settings.shortcuts);
  const history = useKite((st) => st.s.history);
  const favIds = useKite((st) => st.s.favorites);
  const items = useKite((st) => st.s.items);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const [today] = useState(() => new Date());

  // Ready to type the moment it appears, and when New Tab or the address bar is clicked again.
  useEffect(() => {
    const focus = () => input.current?.focus();
    const t = window.setTimeout(focus, 0);
    window.addEventListener('kite:focus-start', focus);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('kite:focus-start', focus);
    };
  }, []);

  const favorites = useMemo(() => favIds.map((id) => items[id]).filter((it): it is TabItem => it?.kind === 'tab').slice(0, MAX_TILES), [favIds, items]);
  const frequent = useMemo(() => frequentSites(history, new Set(favorites.map((f) => hostOf(f.url)))), [history, favorites]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return history.filter((h) => /^https?:/i.test(h.url) && (h.url.toLowerCase().includes(t) || h.title.toLowerCase().includes(t))).slice(0, MAX_SUGGESTIONS);
  }, [q, history]);

  /** Is this page a new tab that's still empty (vs. the window with nothing open)? */
  const emptyTab = () => {
    const tab = tabId ? useKite.getState().s.items[tabId] : null;
    return tab?.kind === 'tab' && isNewTabUrl(tab.url);
  };

  const go = (target: string) => {
    const t = target.trim();
    if (!t) return;
    if (tabId && emptyTab()) {
      const url = /^kite:/i.test(t) ? t : normalizeInput(t, useKite.getState().s.settings.searchEngine);
      if (url) navigateTab(tabId, url);
    } else openUrl(t, 'new');
    setQ('');
    setSel(-1);
  };

  /** A Favorite is a tab you keep: go to it, and drop the unused new tab. */
  const openFavorite = (id: ID) => {
    if (tabId && emptyTab()) act((d) => ops.closeItem(d, tabId, now()));
    selectItem(id);
  };

  const hasTiles = favorites.length > 0 || frequent.length > 0;
  let tileIndex = 0;

  return (
    <div className="start" data-testid={tabId ? 'start-page' : 'empty-state'}>
      <div className="start-inner">
        <header className="start-hello">
          <h1 className="start-greet">{greeting(today.getHours())}</h1>
          <p className="start-date">{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </header>

        <div className="start-box" data-open={matches.length > 0 || undefined}>
          <label className="start-search" data-testid={tabId ? undefined : 'empty-search'}>
            <span className="start-brand" aria-hidden="true">
              <KiteLogo size={22} />
            </span>
            <input
              ref={input}
              className="start-input"
              data-testid="start-input"
              placeholder="Search or enter address"
              aria-label="Search or enter address"
              autoComplete="off"
              spellCheck={false}
              value={q}
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-controls="start-suggest"
              aria-activedescendant={sel >= 0 ? `start-sug-${sel}` : undefined}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && matches.length) {
                  e.preventDefault();
                  setSel((i) => (i + 1) % matches.length);
                } else if (e.key === 'ArrowUp' && matches.length) {
                  e.preventDefault();
                  setSel((i) => (i <= 0 ? matches.length - 1 : i - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(sel >= 0 ? matches[sel].url : q);
                } else if (e.key === 'Escape' && q) {
                  e.stopPropagation();
                  setQ('');
                  setSel(-1);
                }
              }}
            />
            <kbd className="start-kbd" data-typing={q ? true : undefined}>
              {q ? <CornerDownLeft size={12} /> : formatShortcut(sc.commandBar, isMac)}
            </kbd>
          </label>
          {matches.length > 0 && (
            <ul className="start-suggest" id="start-suggest" role="listbox" data-testid="start-suggest">
              {matches.map((h, i) => (
                <li key={h.url} id={`start-sug-${i}`} role="option" aria-selected={i === sel} data-on={i === sel || undefined} onMouseDown={(e) => { e.preventDefault(); go(h.url); }} onMouseEnter={() => setSel(i)}>
                  <SiteIcon url={h.url} title={h.title} size={16} />
                  <span className="start-sug-title">{siteName(h.url, h.title)}</span>
                  <span className="start-sug-url">{displayUrl(h.url)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasTiles && (
          // Stays in place (just hidden) while suggestions show, so the page doesn't jump.
          <div className="start-sections" data-hidden={matches.length > 0 || undefined} aria-hidden={matches.length > 0 || undefined}>
            {favorites.length > 0 && (
              <section className="start-sec" aria-label="Favorites">
                <h2 className="start-sec-h">Favorites</h2>
                <div className="start-grid" data-testid="start-favorites">
                  {favorites.map((f) => (
                    <Tile key={f.id} url={f.url} title={f.customTitle ?? f.title} favicon={f.favicon} index={tileIndex++} testId="start-favorite" onOpen={() => openFavorite(f.id)} />
                  ))}
                </div>
              </section>
            )}
            {frequent.length > 0 && (
              <section className="start-sec" aria-label="Frequently visited">
                <h2 className="start-sec-h">Frequently visited</h2>
                <div className="start-grid" data-testid="start-sites">
                  {frequent.map((h) => (
                    <Tile key={h.url} url={h.url} title={h.title} index={tileIndex++} testId="start-site" onOpen={() => go(h.url)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <footer className="start-foot">
        <span><kbd>{formatShortcut(sc.newNote, isMac)}</kbd> New note</span>
        <span><kbd>{formatShortcut(sc.toggleSidebar, isMac)}</kbd> Hide sidebar</span>
        <span><kbd>{formatShortcut(sc.settings, isMac)}</kbd> Settings</span>
      </footer>
    </div>
  );
}

/** A bookmark tile: the site's icon on a soft square, its name underneath. */
function Tile({ url, title, favicon, index, testId, onOpen }: { url: string; title?: string; favicon?: string; index: number; testId: string; onOpen: () => void }) {
  const name = siteName(url, title);
  return (
    <button className="start-tile" data-testid={testId} title={`${name}\n${displayUrl(url)}`} style={{ '--i': index } as React.CSSProperties} onClick={onOpen}>
      <span className="start-tile-icon">
        <SiteIcon url={url} favicon={favicon} title={title} size={26} />
      </span>
      <span className="start-tile-name">{name}</span>
    </button>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Globe, ArrowRight, Zap, CornerDownLeft, History, LayoutGrid, StickyNote } from 'lucide-react';
import { ACTION_CATALOG, matchRanges, suggest, type Suggestion } from '@shared/commandbar';
import { formatShortcut } from '@shared/shortcuts';
import { displayUrl } from '@shared/url';
import { getS, setUi, useKite } from '../store';
import { actions, openUrl, selectItem, switchSpaceCmd } from '../commands';
import { isMac } from '../platform';
import { SiteIcon } from './SiteIcon';
import { KiteLogo } from './KiteLogo';

export function CommandBar() {
  const cb = useKite((st) => st.ui.commandBar);
  if (!cb) return null;
  return <CommandBarInner key={`${cb.mode}:${cb.initial}:${cb.target ?? ''}`} mode={cb.mode} initial={cb.initial} target={cb.target} />;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(query, text);
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let i = 0;
  ranges.forEach(([a, b], k) => {
    if (a > i) parts.push(text.slice(i, a));
    parts.push(<mark key={k}>{text.slice(a, b)}</mark>);
    i = b;
  });
  parts.push(text.slice(i));
  return <>{parts}</>;
}

function CommandBarInner({ mode, initial, target }: { mode: 'new' | 'edit'; initial: string; target?: 'split' }) {
  const [q, setQ] = useState(initial);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const s = useKite((st) => st.s);
  const engine = s.settings.searchEngine;
  const touched = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const available = useMemo(() => ACTION_CATALOG.filter((a) => a.id in actions), []);
  // In edit mode, show suggestions only once the user starts typing.
  const results = useMemo(() => (mode === 'edit' && !touched.current ? [] : suggest(s, q, { actions: available })), [s, q, mode, available]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const close = () => setUi({ commandBar: null });

  const run = (r: Suggestion | undefined, newTab = false) => {
    const where = target === 'split' ? 'split' : mode === 'edit' && !newTab ? 'current' : 'new';
    close();
    if (!r) {
      if (q.trim()) openUrl(q, where);
      return;
    }
    switch (r.kind) {
      case 'open':
      case 'search':
      case 'history':
        openUrl(r.url, where);
        break;
      case 'tab':
        if (target === 'split') openUrl(r.url, 'split');
        else selectItem(r.itemId);
        break;
      case 'note':
        selectItem(r.itemId);
        break;
      case 'action':
        actions[r.actionId]?.();
        break;
      case 'space':
        switchSpaceCmd(r.spaceId);
        break;
    }
  };

  const engineName = (() => {
    try {
      return new URL(engine.replace('%s', 'x')).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'the web';
    }
  })();

  return (
    <div className="cb-scrim" data-testid="command-bar" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cb" role="dialog" aria-label="Command bar">
        <div className="cb-input-row">
          {/* The same Kite mark as the start page's box: one search, one look. */}
          <span className="cb-icon cb-brand" aria-hidden="true"><KiteLogo size={18} /></span>
          <input
            ref={ref}
            className="cb-input"
            data-testid="cb-input"
            value={q}
            spellCheck={false}
            placeholder={target === 'split' ? 'Open in a new split pane…' : mode === 'edit' ? 'Enter a new address' : 'Search or enter address, or run a command'}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="cb-list"
            aria-activedescendant={results[sel] ? `cb-${sel}` : undefined}
            onChange={(e) => {
              touched.current = true;
              setQ(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              } else if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
                e.preventDefault();
                setSel((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
                e.preventDefault();
                setSel((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[sel], e.metaKey || e.ctrlKey);
              }
            }}
          />
          {target === 'split' && <span className="cb-badge">Split View</span>}
        </div>
        {results.length > 0 && (
          <div className="cb-list" id="cb-list" role="listbox" ref={listRef} data-testid="cb-results">
            {results.map((r, i) => (
              <div
                key={r.key}
                id={`cb-${i}`}
                role="option"
                aria-selected={i === sel}
                data-index={i}
                data-kind={r.kind}
                data-testid={`cb-result-${r.kind}`}
                className="cb-row"
                data-on={i === sel || undefined}
                onMouseMove={() => setSel(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(r, e.metaKey || e.ctrlKey);
                }}
              >
                <span className="cb-row-icon">
                  {r.kind === 'tab' || r.kind === 'history' ? (
                    <SiteIcon url={r.url} title={r.title} favicon={r.kind === 'tab' ? (getS().items[r.itemId] as { favicon?: string })?.favicon : undefined} size={18} />
                  ) : r.kind === 'open' ? (
                    <Globe size={17} />
                  ) : r.kind === 'search' ? (
                    <Search size={17} />
                  ) : r.kind === 'note' ? (
                    <StickyNote size={16} />
                  ) : r.kind === 'action' ? (
                    <Zap size={16} />
                  ) : (
                    <span className="cb-space-icon">{r.icon}</span>
                  )}
                </span>
                <span className="cb-row-text">
                  <span className="cb-row-title">
                    {r.kind === 'search' ? (
                      <>
                        {r.title} <span className="cb-dim">— search {engineName}</span>
                      </>
                    ) : r.kind === 'open' ? (
                      <>Open {displayUrl(r.url)}</>
                    ) : (
                      <Highlight text={r.title} query={q} />
                    )}
                  </span>
                  {(r.kind === 'tab' || r.kind === 'history') && (
                    <span className="cb-row-sub">
                      <Highlight text={displayUrl(r.url)} query={q} />
                    </span>
                  )}
                </span>
                <span className="cb-row-meta">
                  {r.kind === 'tab' && (
                    <span className="cb-pill">
                      <LayoutGrid size={11} /> Switch to Tab{r.spaceId && r.spaceId !== s.activeSpaceId ? ` · ${r.spaceName}` : ''}
                    </span>
                  )}
                  {r.kind === 'note' && (
                    <span className="cb-pill">
                      <StickyNote size={11} /> Switch to Note
                    </span>
                  )}
                  {r.kind === 'history' && <History size={13} className="cb-dim" />}
                  {r.kind === 'action' && s.settings.shortcuts[r.actionId] && <kbd>{formatShortcut(s.settings.shortcuts[r.actionId], isMac)}</kbd>}
                  {r.kind === 'space' && <ArrowRight size={14} className="cb-dim" />}
                  {i === sel && <CornerDownLeft size={13} className="cb-enter" />}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="cb-foot">
          <span><kbd>↑↓</kbd> move</span>
          <span><kbd>↩</kbd> open</span>
          <span><kbd>{isMac ? '⌘↩' : 'Ctrl+↩'}</kbd> new tab</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

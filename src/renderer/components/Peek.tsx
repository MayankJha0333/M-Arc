import { useEffect, useRef, useState } from 'react';
import { Maximize2, Columns2, Link2, X, ArrowLeft } from 'lucide-react';
import { displayUrl } from '@shared/url';
import { getUi, setUi, toast, useKite } from '../store';
import { openUrl, openInSplit, setClosePeek } from '../commands';
import { WebSurface } from './WebSurface';
import { setupPage } from '../pageSetup';
import { surface } from '../surfaces';
import { SiteIcon } from './SiteIcon';

let peekSeq = 0;
setClosePeek(() => closePeek());
let lastClosed: { url: string; sourceTabId: string | null } | null = null;

export function closePeek(withUndo = true) {
  const p = getUi().peek;
  if (!p) return;
  setUi({ peek: null });
  if (withUndo) {
    lastClosed = { url: p.url, sourceTabId: p.sourceTabId };
    toast('Closed Peek', 'Reopen', () => lastClosed && setUi({ peek: { ...lastClosed } }));
  }
}

/** A floating preview of a link over the current page. */
export function Peek() {
  const peek = useKite((st) => st.ui.peek);
  const [key, setKey] = useState('');
  const opened = useRef<string | null>(null);
  // Each new Peek gets a fresh page; navigating inside it keeps the same one.
  useEffect(() => {
    if (peek && opened.current === null) {
      opened.current = peek.url;
      setKey(`peek:${++peekSeq}`);
    }
    if (!peek) opened.current = null;
  }, [peek]);
  if (!peek || !key) return null;
  return <PeekWindow key={key} id={key} />;
}

function PeekWindow({ id }: { id: string }) {
  const peek = useKite((st) => st.ui.peek)!;
  const [initial] = useState(peek.url);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [title, setTitle] = useState('');

  const expand = () => {
    const url = getUi().peek?.url ?? initial;
    setUi({ peek: null });
    openUrl(url, 'new');
  };
  const toSplit = () => {
    const url = getUi().peek?.url ?? initial;
    setUi({ peek: null });
    openInSplit(url);
  };

  return (
    <div className="peek-scrim" data-testid="peek" onMouseDown={(e) => e.target === e.currentTarget && closePeek()}>
      <div className="peek" role="dialog" aria-label="Peek">
        <div className="peek-bar">
          <button className="icon-btn tiny" aria-label="Back" disabled={!nav.back} onClick={() => surface(id)?.back()}>
            <ArrowLeft size={13} />
          </button>
          <SiteIcon url={peek.url} title={title} size={14} />
          <span className="peek-title" data-testid="peek-url">
            {title && <b>{title}</b>} <span>{displayUrl(peek.url)}</span>
          </span>
          <button className="btn small ghost" data-testid="peek-copy" title="Copy link" onClick={() => { void navigator.clipboard?.writeText(peek.url).catch(() => undefined); toast('Copied link'); }}>
            <Link2 size={13} />
          </button>
          <button className="btn small ghost" data-testid="peek-split" title="Open in Split View" onClick={toSplit}>
            <Columns2 size={13} /> Split
          </button>
          <button className="btn small ghost" data-testid="peek-expand" title="Open as a tab" onClick={expand}>
            <Maximize2 size={13} /> Open
          </button>
          <button className="icon-btn tiny" aria-label="Close Peek" data-testid="peek-close" onClick={() => closePeek()}>
            <X size={14} />
          </button>
        </div>
        <div className="peek-body">
          <WebSurface
            id={id}
            initialUrl={initial}
            visible
            onNavigate={(url) => setUi((u) => (u.peek ? { peek: { ...u.peek, url } } : {}))}
            onTitle={setTitle}
            onFavicon={() => undefined}
            onLoading={() => undefined}
            onNav={(back, forward) => setNav({ back, forward })}
            onLink={(decision, url) => openUrl(url, decision === 'little' ? 'little' : 'new')}
            onOpen={(url, bg) => openUrl(url, bg ? 'background' : 'new')}
            onReady={(handle, url) => {
              setupPage(id, handle, url, true);
              handle.focus(); // so Esc and typing go to the Peek, not the page behind it
            }}
            onEscape={() => closePeek()}
          />
        </div>
      </div>
    </div>
  );
}

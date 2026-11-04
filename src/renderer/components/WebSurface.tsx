import { useEffect, useRef } from 'react';
import type { WebviewTag } from 'electron';
import type { ID } from '@shared/types';
import { parseLinkMessage } from '@shared/links';
import { bridge, isElectron } from '../platform';
import { registerSurface, type SurfaceHandle } from '../surfaces';
import { fakePageHtml, fakeTitle } from '../fakePage';

export interface SurfaceEvents {
  onNavigate(url: string): void;
  onTitle(title: string): void;
  onFavicon(url: string): void;
  onLoading(loading: boolean): void;
  onNav(back: boolean, forward: boolean): void;
  onLink(decision: 'peek' | 'little', url: string): void;
  onOpen?(url: string, background: boolean): void;
  onReady(handle: SurfaceHandle, url: string): void;
  onFocus?(): void;
  onEscape?(): void;
}

interface Props extends SurfaceEvents {
  id: ID;
  initialUrl: string;
  visible: boolean;
}

/** A web page. Real <webview> in the app; a simulated page in test mode. */
export function WebSurface(props: Props) {
  return isElectron ? <ElectronSurface {...props} /> : <SimulatedSurface {...props} />;
}

function ElectronSurface({ id, initialUrl, visible, ...ev }: Props) {
  const ref = useRef<WebviewTag | null>(null);
  const evRef = useRef(ev);
  evRef.current = ev;
  const src = useRef(initialUrl);

  useEffect(() => {
    const wv = ref.current!;
    let wcId: number | null = null;
    let zoom = 0;
    const nav = () => {
      try {
        evRef.current.onNav(wv.canGoBack(), wv.canGoForward());
      } catch {
        /* not ready yet */
      }
    };
    const handle: SurfaceHandle = {
      load: (url) => void wv.loadURL(url).catch(() => undefined),
      back: () => wv.canGoBack() && wv.goBack(),
      forward: () => wv.canGoForward() && wv.goForward(),
      reload: () => wv.reload(),
      stop: () => wv.stop(),
      zoom: (d) => {
        zoom = d === 'reset' ? 0 : Math.max(-5, Math.min(7, zoom + d));
        wv.setZoomLevel(zoom);
      },
      find: (text, forward = true) => {
        if (text) wv.findInPage(text, { forward, findNext: true });
      },
      stopFind: () => wv.stopFindInPage('clearSelection'),
      exec: (js) => wv.executeJavaScript(js),
      insertCSS: (css) => wv.insertCSS(css),
      removeCSS: (key) => wv.removeInsertedCSS(key),
      webContentsId: () => wcId,
      focus: () => wv.focus(),
    };
    const unregister = registerSurface(id, handle);
    const onReady = () => {
      wcId = wv.getWebContentsId();
      bridge.registerPage(wcId, id);
      nav();
      evRef.current.onReady(handle, wv.getURL());
    };
    const onNavigate = (e: Electron.DidNavigateEvent) => {
      evRef.current.onNavigate(e.url);
      nav();
    };
    const onInPage = (e: Electron.DidNavigateInPageEvent) => {
      if (e.isMainFrame) {
        evRef.current.onNavigate(e.url);
        nav();
      }
    };
    const onTitle = (e: Electron.PageTitleUpdatedEvent) => evRef.current.onTitle(e.title);
    const onFavicon = (e: Electron.PageFaviconUpdatedEvent) => e.favicons[0] && evRef.current.onFavicon(e.favicons[0]);
    const onStart = () => evRef.current.onLoading(true);
    const onStop = () => {
      evRef.current.onLoading(false);
      nav();
    };
    const onConsole = (e: Electron.ConsoleMessageEvent) => {
      const m = parseLinkMessage(e.message);
      if (m) evRef.current.onLink(m.decision as 'peek' | 'little', m.url);
    };
    const onFocus = () => evRef.current.onFocus?.();
    wv.addEventListener('dom-ready', onReady);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onInPage);
    wv.addEventListener('page-title-updated', onTitle);
    wv.addEventListener('page-favicon-updated', onFavicon);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('console-message', onConsole);
    wv.addEventListener('focus', onFocus);
    return () => {
      unregister();
      if (wcId !== null) bridge.unregisterPage(wcId);
      wv.removeEventListener('dom-ready', onReady);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onInPage);
      wv.removeEventListener('page-title-updated', onTitle);
      wv.removeEventListener('page-favicon-updated', onFavicon);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('console-message', onConsole);
      wv.removeEventListener('focus', onFocus);
    };
  }, [id]);

  return (
    <webview
      ref={ref as never}
      className="surface"
      data-testid={`surface-${id}`}
      data-visible={visible ? 'true' : 'false'}
      src={src.current}
      partition="persist:kite"
      allowpopups={'true' as never}
      webpreferences="contextIsolation=yes, sandbox=yes"
    />
  );
}

/** Test mode: a generated page in an iframe that behaves like a small website. */
function SimulatedSurface({ id, initialUrl, visible, ...ev }: Props) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const evRef = useRef(ev);
  evRef.current = ev;
  const hist = useRef<{ stack: string[]; i: number }>({ stack: [initialUrl], i: 0 });
  const css = useRef(new Map<string, HTMLStyleElement>());

  useEffect(() => {
    const frame = ref.current!;
    let seq = 0;
    const current = () => hist.current.stack[hist.current.i];
    const report = () => evRef.current.onNav(hist.current.i > 0, hist.current.i < hist.current.stack.length - 1);
    const render = () => {
      evRef.current.onLoading(true);
      css.current.clear();
      frame.srcdoc = fakePageHtml(current());
    };
    const go = (url: string) => {
      const h = hist.current;
      h.stack = [...h.stack.slice(0, h.i + 1), url];
      h.i = h.stack.length - 1;
      render();
    };
    const handle: SurfaceHandle = {
      load: (url) => go(url),
      back: () => {
        if (hist.current.i > 0) {
          hist.current.i--;
          render();
        }
      },
      forward: () => {
        if (hist.current.i < hist.current.stack.length - 1) {
          hist.current.i++;
          render();
        }
      },
      reload: () => render(),
      stop: () => evRef.current.onLoading(false),
      zoom: (d) => {
        const doc = frame.contentDocument;
        if (!doc) return;
        const cur = Number(doc.body.dataset.zoom ?? 0);
        const z = d === 'reset' ? 0 : cur + d;
        doc.body.dataset.zoom = String(z);
        doc.body.style.zoom = String(1 + z * 0.1);
      },
      find: (text) => {
        const doc = frame.contentDocument;
        if (doc) doc.body.dataset.find = text;
      },
      stopFind: () => {
        const doc = frame.contentDocument;
        if (doc) delete doc.body.dataset.find;
      },
      exec: async (js) => {
        const win = frame.contentWindow as (Window & { eval(s: string): unknown }) | null;
        return win ? win.eval(js) : undefined;
      },
      insertCSS: async (text) => {
        const doc = frame.contentDocument;
        if (!doc) return null;
        const key = `k${++seq}`;
        const el = doc.createElement('style');
        el.dataset.kiteCss = key;
        el.textContent = text;
        doc.head.append(el);
        css.current.set(key, el);
        return key;
      },
      removeCSS: async (key) => {
        css.current.get(key)?.remove();
        css.current.delete(key);
      },
      webContentsId: () => null,
      focus: () => frame.contentWindow?.focus(),
    };
    const unregister = registerSurface(id, handle);
    const onLoad = () => {
      const win = frame.contentWindow as (Window & typeof globalThis) | null;
      const doc = frame.contentDocument;
      if (!win || !doc) return;
      const url = current();
      win.console.debug = (msg: unknown) => {
        const m = typeof msg === 'string' ? parseLinkMessage(msg) : null;
        if (m) evRef.current.onLink(m.decision as 'peek' | 'little', m.url);
      };
      // Normal clicks the page didn't handle: navigate or open a tab, like a browser would.
      doc.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
        if (!a) return;
        e.preventDefault();
        const href = new URL(a.getAttribute('href')!, url).href;
        const mod = e.metaKey || e.ctrlKey;
        if (a.target === '_blank' || mod) evRef.current.onOpen?.(href, mod && !e.shiftKey);
        else go(href);
      });
      // Like Electron's main process: pass modifier key presses up to the app.
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && id.startsWith('peek:')) {
          e.preventDefault();
          evRef.current.onEscape?.();
          return;
        }
        if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
        const copy = new KeyboardEvent('keydown', { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, bubbles: true, cancelable: true });
        window.dispatchEvent(copy);
        if (copy.defaultPrevented) e.preventDefault();
      });
      doc.addEventListener('focusin', () => evRef.current.onFocus?.());
      doc.addEventListener('mousedown', () => evRef.current.onFocus?.());
      evRef.current.onNavigate(url);
      evRef.current.onTitle(fakeTitle(url));
      evRef.current.onLoading(false);
      report();
      evRef.current.onReady(handle, url);
    };
    frame.addEventListener('load', onLoad);
    render();
    return () => {
      unregister();
      frame.removeEventListener('load', onLoad);
    };
  }, [id]);

  return (
    <iframe
      ref={ref}
      className="surface"
      title={`page-${id}`}
      data-testid={`surface-${id}`}
      data-visible={visible ? 'true' : 'false'}
      sandbox="allow-same-origin allow-scripts"
    />
  );
}

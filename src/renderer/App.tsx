import { useMemo } from 'react';
import { activeSpace } from '@shared/tree';
import { useKite, setUi } from './store';
import { useBoot } from './boot';
import { themeVars, resolveDark } from './theme';
import { Sidebar } from './components/Sidebar';
import { Stage } from './components/Stage';
import { CommandBar } from './components/CommandBar';
import { ContextMenuHost } from './components/ContextMenu';
import { Toasts } from './components/Toasts';
import { Panels } from './components/Panels';
import { ZapHint } from './components/Boosts';
import { bridge, desktopChrome, isMac } from './platform';
import { useEffect } from 'react';
import { useSystemDark } from './systemDark';

export { useSystemDark };

export function App() {
  useBoot();
  const ready = useKite((st) => st.ui.ready);
  if (!ready) return <div className="boot" />;
  return <Shell />;
}

function Shell() {
  const savedSettings = useKite((st) => st.s.settings);
  const savedTheme = useKite((st) => activeSpace(st.s).theme);
  // While you try a look in Settings, the whole window previews it.
  const draft = useKite((st) => st.ui.lookDraft);
  const settings = useMemo(() => (draft?.settings ? { ...savedSettings, ...draft.settings } : savedSettings), [savedSettings, draft]);
  const theme = useMemo(() => (draft?.theme ? { ...savedTheme, ...draft.theme } : savedTheme), [savedTheme, draft]);
  const spaceId = useKite((st) => st.s.activeSpaceId);
  const sidebarPeek = useKite((st) => st.ui.sidebarPeek);
  const systemDark = useSystemDark();
  const vars = useMemo(() => themeVars(theme, settings, systemDark), [theme, settings, systemDark]);
  const dark = resolveDark(theme, systemDark);
  const collapsed = settings.sidebarCollapsed;
  const fullscreen = useKite((st) => st.ui.fullscreen);
  const onSettings = useKite((st) => st.ui.panel === 'settings' || st.ui.panel === 'shortcuts');

  useEffect(() => bridge.onWindowState((v) => setUi({ fullscreen: v.fullscreen })), []);
  // macOS: the window's close/minimise/zoom buttons live in the sidebar's top corner,
  // wherever the sidebar is, and hide with it. No empty band is kept above the page.
  useEffect(() => {
    if (!desktopChrome || !isMac) return;
    const place = () => {
      const peek = collapsed && sidebarPeek;
      const inset = peek ? 6 : 0;
      const x = settings.sidebarSide === 'left' ? inset + 16 : window.innerWidth - inset - settings.sidebarWidth + 14;
      // Full screen: macOS shows the buttons itself when you move to the top edge, like
      // every other app, so they are left on and nothing in Kite is reserved for them.
      if (fullscreen) return bridge.setWindowButtons({ visible: true, x: 16, y: 16 });
      bridge.setWindowButtons({ visible: !collapsed || peek, x, y: inset + 16 });
    };
    place();
    if (settings.sidebarSide !== 'right') return;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [collapsed, sidebarPeek, fullscreen, settings.sidebarSide, settings.sidebarWidth]);

  return (
    <div
      className="app"
      style={vars as React.CSSProperties}
      data-testid="app"
      data-theme={dark ? 'dark' : 'light'}
      data-side={settings.sidebarSide}
      data-density={settings.density}
      data-style={settings.look?.style ?? 'calm'}
      data-previewing={draft ? true : undefined}
      data-collapsed={collapsed || undefined}
      data-sidebar-peek={(collapsed && sidebarPeek) || undefined}
      data-motion={settings.reduceMotion ? 'reduced' : 'full'}
      data-electron={desktopChrome || undefined}
      data-fullscreen={fullscreen || undefined}
      data-mac={isMac || undefined}
      data-space={spaceId}
      data-page={onSettings ? 'settings' : undefined}
    >
      {/* The Space's background, moving: a copy of the gradient laid on top only when animated. */}
      {theme.motion && (
        <div className="bg-fx" aria-hidden="true" data-motion={theme.motion.kind}>
          <div className="bg-paint" />
        </div>
      )}
      <div className="grain" aria-hidden="true" />
      <Sidebar />
      {collapsed && <EdgeHotzone side={settings.sidebarSide} />}
      {collapsed && sidebarPeek && <div className="sidebar-peek-catcher" onMouseEnter={() => setUi({ sidebarPeek: false })} />}
      <Stage />
      <CommandBar />
      <Panels />
      <ZapHint />
      <ContextMenuHost />
      <Toasts />
      {settings.chromeCss && <style data-testid="chrome-css">{settings.chromeCss}</style>}
    </div>
  );
}

/**
 * Brings the hidden sidebar out when you move the pointer to its side of the window.
 *
 * Two ways in, because a normal flick to the side is fast:
 * - the pointer moving inside the thin strip along the edge, and
 * - the pointer leaving the window through that side (when the window doesn't touch
 *   the screen edge, the pointer flies past the strip without ever landing in it).
 * It never reacts to the pointer merely resting there when the sidebar hides.
 * In the desktop app the strip is "no-drag" (see app.css): the margin around the page
 * moves the window, and macOS sends no mouse events to the app there.
 */
function EdgeHotzone({ side }: { side: 'left' | 'right' }) {
  useEffect(() => {
    const open = () => !useKite.getState().ui.sidebarPeek && setUi({ sidebarPeek: true });
    const out = (e: MouseEvent) => {
      if (e.relatedTarget) return; // still inside the window
      const h = window.innerHeight;
      if (e.clientY <= 4 || e.clientY >= h - 4) return; // left through the top or bottom
      const nearSide = side === 'left' ? e.clientX <= 24 : e.clientX >= window.innerWidth - 24;
      if (nearSide) open();
    };
    document.addEventListener('mouseout', out);
    return () => document.removeEventListener('mouseout', out);
  }, [side]);
  return (
    <div
      className="edge-hotzone"
      data-testid="edge-hotzone"
      onPointerMove={() => {
        if (!useKite.getState().ui.sidebarPeek) setUi({ sidebarPeek: true });
      }}
    />
  );
}

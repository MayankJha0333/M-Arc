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

  useEffect(() => bridge.onWindowState((v) => setUi({ fullscreen: v.fullscreen })), []);
  // macOS: the window's close/minimise/zoom buttons live in the sidebar's top corner,
  // wherever the sidebar is, and hide with it. No empty band is kept above the page.
  useEffect(() => {
    if (!desktopChrome || !isMac) return;
    const place = () => {
      const peek = collapsed && sidebarPeek;
      const inset = peek ? 6 : 0;
      const x = settings.sidebarSide === 'left' ? inset + 16 : window.innerWidth - inset - settings.sidebarWidth + 14;
      bridge.setWindowButtons({ visible: !fullscreen && (!collapsed || peek), x, y: inset + 16 });
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
    >
      <div className="grain" aria-hidden="true" />
      <Sidebar />
      {collapsed && <div className="edge-hotzone" data-testid="edge-hotzone" onMouseEnter={() => setUi({ sidebarPeek: true })} />}
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

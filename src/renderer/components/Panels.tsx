import { useKite } from '../store';
import { SpaceEditor } from './Spaces';
import { ArchivePage } from './ArchivePage';
import { BoostEditor, BoostsList } from './Boosts';
import { RoutingPanel } from './Routing';
import { ImportArc } from './ImportArc';

/** Side sheets (Settings, Archive, Boosts, Space editor…). */
export function Panels() {
  const panel = useKite((st) => st.ui.panel);
  const arg = useKite((st) => st.ui.panelArg);
  if (panel === 'space' && arg) return <SpaceEditor id={arg} />;
  if (panel === 'archive') return <ArchivePage />;
  if (panel === 'boost' && arg) return <BoostEditor key={arg} id={arg} />;
  if (panel === 'boosts') return <BoostsList />;
  if (panel === 'routing') return <RoutingPanel />;
  if (panel === 'import') return <ImportArc />;
  return null;
}

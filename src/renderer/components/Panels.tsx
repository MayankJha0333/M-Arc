import { useKite } from '../store';
import { SpaceEditor } from './Spaces';
import { ArchivePage } from './ArchivePage';

/** Side sheets (Settings, Archive, Boosts, Space editor…). */
export function Panels() {
  const panel = useKite((st) => st.ui.panel);
  const arg = useKite((st) => st.ui.panelArg);
  if (panel === 'space' && arg) return <SpaceEditor id={arg} />;
  if (panel === 'archive') return <ArchivePage />;
  return null;
}

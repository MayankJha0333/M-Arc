import { useKite } from '../store';

/** Side sheets (Settings, Archive, Boosts…). Filled in by later features. */
export function Panels() {
  const panel = useKite((st) => st.ui.panel);
  if (!panel) return null;
  return null;
}

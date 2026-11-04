// Applies Boosts (custom CSS / JS / hidden elements) to live pages.
// Filled in by the Boosts feature; pages call this after every load.

import type { ID } from '@shared/types';
import type { SurfaceHandle } from './surfaces';

export async function applyBoosts(_tabId: ID, _handle: SurfaceHandle, _url: string): Promise<void> {
  // Boosts arrive in a later step.
}

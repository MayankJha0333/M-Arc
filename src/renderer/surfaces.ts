// Live handles to the web pages on screen, so commands (back, reload, zoom…)
// can reach the right page.

import type { ID } from '@shared/types';

export interface SurfaceHandle {
  load(url: string): void;
  back(): void;
  forward(): void;
  reload(): void;
  stop(): void;
  zoom(delta: number | 'reset'): void;
  find(text: string, forward?: boolean): void;
  stopFind(): void;
  exec(js: string): Promise<unknown>;
  /** Run Kite's own helper code where the page's scripts can't see or change it. */
  execHidden(js: string): Promise<unknown>;
  insertCSS(css: string): Promise<string | null>;
  removeCSS(key: string): Promise<void>;
  webContentsId(): number | null;
  focus(): void;
}

const surfaces = new Map<ID, SurfaceHandle>();

export function registerSurface(id: ID, h: SurfaceHandle) {
  surfaces.set(id, h);
  return () => {
    if (surfaces.get(id) === h) surfaces.delete(id);
  };
}

export function surface(id: ID | null | undefined): SurfaceHandle | undefined {
  return id ? surfaces.get(id) : undefined;
}

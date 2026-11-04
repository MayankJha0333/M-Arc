// The bridge between the app UI (renderer) and Electron's main process.

export type LinkDisposition = 'navigate' | 'peek' | 'new-tab' | 'background-tab' | 'little';

export interface OpenRequest {
  url: string;
  disposition: LinkDisposition;
  sourceTabId: string | null;
}

export interface LittleInit {
  url: string;
  windowId: number;
}

export interface KiteBridge {
  isElectron: true;
  platform: string;
  loadState(): Promise<unknown>;
  saveState(json: string): Promise<void>;
  /** Blocking save, used while quitting. */
  saveStateSync(json: string): boolean;
  registerPage(webContentsId: number, tabId: string): void;
  unregisterPage(webContentsId: number): void;
  /** Run Kite's helper code in a page, in a world the page's own scripts can't see. */
  execIsolated(webContentsId: number, code: string): Promise<unknown>;
  /** Pop a page's playing video out into a floating window. Resolves true if one popped out. */
  pipEnter(webContentsId: number): Promise<boolean>;
  pipExit(webContentsId: number): Promise<void>;
  /** Tabs to pop a video out of the moment you switch to another app (best first). */
  setPipTargets(tabIds: string[]): void;
  /** The main process popped a video out (you left Kite) or put it back (you returned). */
  onPipState(cb: (v: { tabId: string; popped: boolean }) => void): () => void;
  setShortcuts(shortcuts: Record<string, string>, littleHotkey: string): void;
  onShortcut(cb: (action: string) => void): () => void;
  onOpen(cb: (req: OpenRequest) => void): () => void;
  onOpenSplit(cb: (v: { url: string; sourceTabId: string }) => void): () => void;
  onExternalUrl(cb: (url: string) => void): () => void;
  onLittleToMain(cb: (v: { url: string; spaceId: string | null }) => void): () => void;
  openLittle(url: string): void;
  /** From a little window: hand the page to the main window. */
  moveLittleToMain(url: string, spaceId: string | null): void;
  onLittleInit(cb: (init: LittleInit) => void): () => void;
  /** A little window archived itself; the main window records it. */
  archiveFromLittle(url: string, title: string): void;
  onLittleArchived(cb: (v: { url: string; title: string }) => void): () => void;
  pickArcFile(): Promise<{ path: string; text: string } | null>;
  readDefaultArcFile(): Promise<{ path: string; text: string } | null>;
  setDefaultBrowser(): Promise<boolean>;
  isDefaultBrowser(): Promise<boolean>;
  exportFile(name: string, text: string): Promise<boolean>;
}

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

/** The settings the main process needs to know about. */
export interface Prefs {
  shields: import('./shields').Shields;
  httpsOnly: boolean;
  sendGpc: boolean;
  askWhereToSave: boolean;
}

export interface ShieldsStatus {
  /** 'builtin' = the small list inside Kite; 'full' = the downloaded lists. */
  source: 'builtin' | 'full';
  updatedAt: number;
  updating: boolean;
  error?: string;
}

export interface SitePermission {
  site: string;
  permission: string;
  /** e.g. "use your camera or microphone". */
  label: string;
  allowed: boolean;
}

/** An answer that may be a readable error instead. */
export type Result<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'open' | 'reveal' | 'remove' | 'clear';
export interface ClearWhat {
  cookies: boolean;
  cache: boolean;
  storage: boolean;
}

type DownloadEntry = import('./downloads').DownloadEntry;
type ExtensionInfo = import('./extensions').ExtensionInfo;
type ExtensionPreview = import('./extensions').ExtensionPreview;

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
  /** Is any video or audio in this page still playing (checks every frame)? */
  mediaPlaying(webContentsId: number): Promise<boolean>;
  /** Write a line to kite-debug.log (only when running from source). */
  debugLog(msg: string): void;
  /** Floating-video controls: Back to tab / Minimize / Show video / Close. */
  pipFrameAction(action: import('./pipFrame').PipFrameAction): void;
  /** Floating-video controls: play/pause, seek, skip. */
  pipFrameMedia(cmd: import('./pip').PipMediaCommand): void;
  /** Floating-video controls: you started / stopped dragging the video (or one of its edges, to resize). */
  pipFrameDrag(phase: 'start' | 'end', edge?: import('./pipFrame').ResizeEdge): void;
  /** Floating-video controls: which layout, and where the video is. */
  onPipFrameState(cb: (v: import('./pipFrame').PipFrameState) => void): () => void;
  /** Main window: show this tab (from the floating video's "Back to tab"). */
  onFocusTab(cb: (tabId: string) => void): () => void;
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

  // ---- Window ----
  /** macOS: show, hide or move the window's close/minimise/zoom buttons so they sit in the sidebar. */
  setWindowButtons(v: { visible: boolean; x: number; y: number }): void;
  onWindowState(cb: (v: { fullscreen: boolean }) => void): () => void;

  // ---- Shields, privacy and security ----
  setPrefs(p: Prefs): void;
  shieldsStatus(): Promise<ShieldsStatus>;
  /** Download the filter lists again now. */
  refreshShields(): Promise<ShieldsStatus>;
  onShieldsStatus(cb: (v: ShieldsStatus) => void): () => void;
  /** How many requests were blocked on a tab's page. */
  onShieldsCount(cb: (v: { tabId: string; count: number }) => void): () => void;
  /** Open this host over http although HTTPS-only is on (until Kite quits). */
  allowHttp(host: string): void;
  permissions(): Promise<SitePermission[]>;
  onPermissions(cb: (v: SitePermission[]) => void): () => void;
  /** Forget remembered answers: one, a whole site's, or (no arguments) all. */
  forgetPermission(site?: string, permission?: string): void;
  /** Erase cookies, cache and/or site storage: for one site, or everything. */
  clearData(what: ClearWhat, site?: string): Promise<void>;

  // ---- Downloads ----
  downloads(): Promise<DownloadEntry[]>;
  onDownloads(cb: (v: DownloadEntry[]) => void): () => void;
  onDownloadDone(cb: (v: DownloadEntry) => void): () => void;
  /** Resolves to a readable problem, or null. */
  downloadAction(action: DownloadAction, id?: string): Promise<string | null>;
  /** Videos, sounds and streams the page has loaded. */
  pageMedia(webContentsId: number): Promise<import('./downloads').MediaItem[]>;
  downloadMedia(webContentsId: number, url: string): void;
  /** Quality levels of a stream (empty = just one). */
  hlsVariants(webContentsId: number, url: string): Promise<Result<import('./downloads').HlsVariant[]>>;
  downloadHls(webContentsId: number, url: string, title: string): void;

  // ---- Chrome extensions ----
  extensions(): Promise<ExtensionInfo[]>;
  onExtensions(cb: (v: ExtensionInfo[]) => void): () => void;
  /** Choose an unpacked folder or a .crx/.zip file. Null = cancelled. Nothing is installed until confirmed. */
  extensionPick(kind: 'folder' | 'file'): Promise<Result<ExtensionPreview | null>>;
  extensionFromStore(input: string): Promise<Result<ExtensionPreview>>;
  extensionConfirm(token: string): Promise<Result<true>>;
  extensionCancel(token: string): void;
  extensionEnable(id: string, enabled: boolean): Promise<void>;
  extensionRemove(id: string): Promise<void>;
  extensionOpen(id: string, which: 'popup' | 'options'): Promise<boolean>;
}

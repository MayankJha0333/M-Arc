// Downloads: the records shown in the Downloads panel, file-name safety, and
// reading HLS (.m3u8) video playlists. Pure and tested; the main process does the I/O.

export type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type DownloadKind = 'file' | 'image' | 'video' | 'audio';

export interface DownloadEntry {
  id: string;
  url: string;
  /** File name on disk. */
  name: string;
  /** Full path on disk ('' until known). */
  path: string;
  kind: DownloadKind;
  state: DownloadState;
  received: number;
  /** 0 when the size isn't known. */
  total: number;
  /** Bytes per second, while downloading. */
  speed: number;
  startedAt: number;
  endedAt?: number;
  error?: string;
  /** Can it be paused and resumed? (Not for converted images or stream downloads.) */
  resumable: boolean;
  /** The site it came from. */
  site: string;
}

/** A video, sound or stream found on the current page. */
export interface MediaItem {
  url: string;
  kind: 'video' | 'audio' | 'stream';
  /** e.g. "video/mp4". */
  mime: string;
  /** 0 when unknown. */
  size: number;
  /** Shown to the user. */
  label: string;
}

/** One quality level of an HLS stream. */
export interface HlsVariant {
  url: string;
  /** e.g. "1080p". */
  label: string;
  height: number;
  bandwidth: number;
}

export interface HlsSegments {
  /** Initialisation part for fragmented MP4 streams. */
  init: string | null;
  segments: string[];
  /** AES-128 key address and IV, when the stream is encrypted with a plain key. */
  key: { url: string; iv: string | null } | null;
  /** DRM or sample encryption: Kite can't (and won't) download these. */
  protected: boolean;
  /** Still being broadcast (no end marker). */
  live: boolean;
  /** Seconds. */
  duration: number;
}

export type ImageFormat = 'original' | 'png' | 'jpeg';

// ---- file names ---------------------------------------------------------------------

/** File types that can run code when opened: you're asked before these are kept. */
const DANGEROUS = new Set([
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'jar', 'reg', 'lnk',
  'app', 'dmg', 'pkg', 'mpkg', 'command', 'tool', 'workflow', 'action', 'scpt', 'scptd', 'terminal', 'inetloc', 'webloc', 'fileloc', 'osax',
  'sh', 'bash', 'zsh', 'csh', 'run', 'bin', 'deb', 'rpm', 'appimage', 'desktop', 'apk', 'iso', 'img', 'dll', 'sys', 'crx', 'xpi', 'py', 'rb', 'pl',
]);

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function isDangerousFile(name: string): boolean {
  // "invoice.pdf.exe" and names ending in dots/spaces (Windows drops them) count too.
  return DANGEROUS.has(extOf(name.replace(/[. ]+$/, '')));
}

/** A name that is safe to use inside a folder: no paths, no control characters, not hidden. */
export function safeFileName(raw: string, fallback = 'download'): string {
  let n = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '') // control + text-direction tricks
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = `_${n}`;
  if (n.length > 180) {
    const e = extOf(n);
    n = e ? `${n.slice(0, 170 - e.length)}.${e}` : n.slice(0, 180);
  }
  return n || fallback;
}

/** "photo.jpg" → "photo (2).jpg" until `taken` says the name is free. */
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name;
  const e = extOf(name);
  const stem = e ? name.slice(0, -(e.length + 1)) : name;
  for (let i = 2; i < 10_000; i++) {
    const n = e ? `${stem} (${i}).${e}` : `${stem} (${i})`;
    if (!taken(n)) return n;
  }
  return `${stem}-${Date.now()}${e ? `.${e}` : ''}`;
}

/** A file name taken from a URL's last path part. */
export function nameFromUrl(url: string, fallback = 'download'): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    return safeFileName(last || u.hostname, fallback);
  } catch {
    return fallback;
  }
}

/** Swap (or add) a file extension. */
export function withExt(name: string, ext: string): string {
  const e = extOf(name);
  return `${e ? name.slice(0, -(e.length + 1)) : name}.${ext}`;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/ogg': 'ogv', 'video/mp2t': 'ts',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'weba', 'audio/aac': 'aac', 'audio/flac': 'flac',
};

export function extForMime(mime: string): string {
  return MIME_EXT[mime.split(';')[0].trim().toLowerCase()] ?? '';
}

export function kindForName(name: string, mime = ''): DownloadKind {
  const e = extOf(name);
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'heic'].includes(e)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'ts', 'm4v', 'ogv'].includes(e)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac', 'weba'].includes(e)) return 'audio';
  return 'file';
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** "3 min left", "12 s left" or '' when it can't be told. */
export function timeLeft(d: Pick<DownloadEntry, 'received' | 'total' | 'speed'>): string {
  if (!d.total || !d.speed || d.received >= d.total) return '';
  const s = Math.round((d.total - d.received) / d.speed);
  if (s < 60) return `${Math.max(1, s)} s left`;
  if (s < 3600) return `${Math.round(s / 60)} min left`;
  return `${(s / 3600).toFixed(1)} h left`;
}

/** 0–1, or null when the size isn't known. */
export function progressOf(d: Pick<DownloadEntry, 'received' | 'total' | 'state'>): number | null {
  if (d.state === 'completed') return 1;
  return d.total > 0 ? Math.max(0, Math.min(1, d.received / d.total)) : null;
}

/** What kind of media a response is, from its Content-Type (null = not media). */
export function mediaKind(mime: string, url: string): MediaItem['kind'] | null {
  const m = mime.split(';')[0].trim().toLowerCase();
  if (m === 'application/vnd.apple.mpegurl' || m === 'application/x-mpegurl' || m === 'audio/mpegurl' || /\.m3u8(\?|$)/i.test(url)) return 'stream';
  if (m === 'video/mp2t' || /\.(ts|m4s)(\?|$)/i.test(url)) return null; // pieces of a stream, not a whole video
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return null;
}

// ---- HLS playlists --------------------------------------------------------------------

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out[m[1]] = m[3] ?? m[2];
  return out;
}

const abs = (u: string, base: string) => {
  try {
    return new URL(u, base).href;
  } catch {
    return '';
  }
};

export function isMasterPlaylist(text: string): boolean {
  return /#EXT-X-STREAM-INF/.test(text);
}

/** Quality levels of a master playlist, best first. */
export function parseMasterPlaylist(text: string, baseUrl: string): HlsVariant[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: HlsVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const a = attrs(lines[i].slice(18));
    const next = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
    const url = next ? abs(next, baseUrl) : '';
    if (!/^https?:/i.test(url)) continue;
    const height = Number(/x(\d+)/.exec(a.RESOLUTION ?? '')?.[1] ?? 0);
    const bandwidth = Number(a.BANDWIDTH ?? 0) || 0;
    out.push({ url, height, bandwidth, label: height ? `${height}p` : bandwidth ? `${Math.round(bandwidth / 1000)} kbps` : 'Stream' });
  }
  out.sort((x, y) => y.height - x.height || y.bandwidth - x.bandwidth);
  // The same height at several bitrates: keep the best of each.
  return out.filter((v, i) => !v.height || out.findIndex((w) => w.height === v.height) === i);
}

/** The pieces of one quality level, in order. */
export function parseMediaPlaylist(text: string, baseUrl: string): HlsSegments {
  const r: HlsSegments = { init: null, segments: [], key: null, protected: false, live: !/#EXT-X-ENDLIST/.test(text), duration: 0 };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-KEY:')) {
      const a = attrs(line.slice(11));
      const method = (a.METHOD ?? 'NONE').toUpperCase();
      if (method === 'NONE') r.key = null;
      else if (method === 'AES-128' && a.URI && !a.KEYFORMAT?.includes('streamingkeydelivery') && /^https?:/i.test(abs(a.URI, baseUrl))) r.key = { url: abs(a.URI, baseUrl), iv: a.IV ?? null };
      else r.protected = true;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const a = attrs(line.slice(11));
      if (a.URI) r.init = abs(a.URI, baseUrl);
    } else if (line.startsWith('#EXTINF:')) {
      r.duration += Number.parseFloat(line.slice(8)) || 0;
    } else if (!line.startsWith('#')) {
      const u = abs(line, baseUrl);
      if (/^https?:/i.test(u)) r.segments.push(u);
    }
  }
  return r;
}

/** The IV for a segment when the playlist doesn't give one: its number, as 16 bytes. */
export function hlsIv(iv: string | null, index: number): Uint8Array {
  const out = new Uint8Array(16);
  if (iv && /^0x[0-9a-f]{1,32}$/i.test(iv)) {
    const hex = iv.slice(2).padStart(32, '0');
    for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  let n = index;
  for (let i = 15; i >= 0 && n > 0; i--) {
    out[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return out;
}

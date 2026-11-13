import { describe, expect, it } from 'vitest';
import {
  extForMime, formatBytes, hlsIv, isDangerousFile, isMasterPlaylist, kindForName, mediaKind, nameFromUrl, parseMasterPlaylist, parseMediaPlaylist, progressOf, safeFileName, timeLeft, uniqueName, withExt,
} from '../../src/shared/downloads';

describe('download file names', () => {
  it('flags files that can run code, including disguised ones', () => {
    for (const n of ['setup.exe', 'Installer.DMG', 'invoice.pdf.exe', 'run.sh', 'tool.app', 'x.scr', 'trick.exe. ', 'a.jar', 'ext.crx']) expect(isDangerousFile(n), n).toBe(true);
    for (const n of ['photo.jpg', 'report.pdf', 'movie.mp4', 'notes.txt', 'archive.zip', 'exe', 'my.exe.txt']) expect(isDangerousFile(n), n).toBe(false);
  });

  it('makes names safe: no folders, hidden files, control or direction-flipping characters', () => {
    expect(safeFileName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(safeFileName('..\\..\\evil.bat')).not.toMatch(/[\\/]/);
    expect(safeFileName('.bashrc')).toBe('bashrc');
    expect(safeFileName('a\u0000b\u202Egnp.exe')).toBe('abgnp.exe');
    expect(safeFileName('  report  final .pdf ')).toBe('report final .pdf');
    expect(safeFileName('CON.txt')).toBe('_CON.txt');
    expect(safeFileName('', 'download')).toBe('download');
    expect(safeFileName('...')).toBe('download');
    const long = safeFileName(`${'x'.repeat(400)}.mp4`);
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith('.mp4')).toBe(true);
  });

  it('never overwrites: picks the next free name', () => {
    const taken = new Set(['a.jpg', 'a (2).jpg', 'README']);
    expect(uniqueName('b.jpg', (n) => taken.has(n))).toBe('b.jpg');
    expect(uniqueName('a.jpg', (n) => taken.has(n))).toBe('a (3).jpg');
    expect(uniqueName('README', (n) => taken.has(n))).toBe('README (2)');
  });

  it('names files from addresses and types', () => {
    expect(nameFromUrl('https://cdn.site.com/img/My%20Photo.webp?w=200')).toBe('My Photo.webp');
    expect(nameFromUrl('https://site.com/')).toBe('site.com');
    expect(nameFromUrl('nonsense', 'image')).toBe('image');
    expect(withExt('photo.webp', 'png')).toBe('photo.png');
    expect(withExt('photo', 'jpg')).toBe('photo.jpg');
    expect(extForMime('video/mp4; codecs="avc1"')).toBe('mp4');
    expect(kindForName('a.MP4')).toBe('video');
    expect(kindForName('blob', 'image/png')).toBe('image');
    expect(kindForName('song.flac')).toBe('audio');
    expect(kindForName('doc.pdf')).toBe('file');
  });

  it('shows sizes, progress and time left', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(900)).toBe('1 KB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
    expect(progressOf({ received: 50, total: 200, state: 'progressing' })).toBe(0.25);
    expect(progressOf({ received: 50, total: 0, state: 'progressing' })).toBeNull();
    expect(progressOf({ received: 0, total: 0, state: 'completed' })).toBe(1);
    expect(timeLeft({ received: 0, total: 6000, speed: 100 })).toBe('1 min left');
    expect(timeLeft({ received: 0, total: 0, speed: 100 })).toBe('');
  });

  it('recognises media responses, and ignores stream pieces', () => {
    expect(mediaKind('video/mp4', 'https://a/v.mp4')).toBe('video');
    expect(mediaKind('audio/mpeg', 'https://a/s.mp3')).toBe('audio');
    expect(mediaKind('application/vnd.apple.mpegurl', 'https://a/x')).toBe('stream');
    expect(mediaKind('text/plain', 'https://a/master.m3u8?t=1')).toBe('stream');
    expect(mediaKind('video/mp2t', 'https://a/seg1.ts')).toBeNull();
    expect(mediaKind('video/mp4', 'https://a/chunk-3.m4s')).toBeNull();
    expect(mediaKind('text/html', 'https://a/')).toBeNull();
  });
});

describe('HLS playlists', () => {
  const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://cdn.example.com/hd/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
mid/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
mid-hi/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1
javascript:alert(1)
`;

  it('lists quality levels, best first, one per height, web addresses only', () => {
    expect(isMasterPlaylist(master)).toBe(true);
    const v = parseMasterPlaylist(master, 'https://video.example.com/show/master.m3u8');
    expect(v.map((x) => x.label)).toEqual(['1080p', '720p', '360p']);
    expect(v[0].url).toBe('https://cdn.example.com/hd/index.m3u8');
    expect(v[1].url).toBe('https://video.example.com/show/mid-hi/index.m3u8');
  });

  it('reads the pieces of a finished stream', () => {
    const pl = parseMediaPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4.0,\nseg0.m4s\n#EXTINF:4.5,\nseg1.m4s\n#EXT-X-ENDLIST\n', 'https://a.com/v/index.m3u8');
    expect(isMasterPlaylist('#EXTM3U\n#EXTINF:4,\na.ts')).toBe(false);
    expect(pl.init).toBe('https://a.com/v/init.mp4');
    expect(pl.segments).toEqual(['https://a.com/v/seg0.m4s', 'https://a.com/v/seg1.m4s']);
    expect(pl.duration).toBe(8.5);
    expect(pl.live).toBe(false);
    expect(pl.protected).toBe(false);
    expect(pl.key).toBeNull();
  });

  it('spots live, plain-key and copy-protected streams', () => {
    expect(parseMediaPlaylist('#EXTM3U\n#EXTINF:4,\na.ts\n', 'https://a.com/x.m3u8').live).toBe(true);
    const aes = parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x000000000000000000000000000000ff\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST', 'https://a.com/x.m3u8');
    expect(aes.key).toEqual({ url: 'https://a.com/key.bin', iv: '0x000000000000000000000000000000ff' });
    expect(aes.protected).toBe(false);
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://abc",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST', 'https://a.com/x.m3u8').protected).toBe(true);
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="skd://abc"\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST', 'https://a.com/x.m3u8').protected).toBe(true);
  });

  it('builds the decryption IV from the playlist or the piece number', () => {
    expect([...hlsIv('0x000000000000000000000000000000ff', 7)].pop()).toBe(255);
    expect([...hlsIv(null, 258)].slice(-2)).toEqual([1, 2]);
    expect(hlsIv(null, 0).every((b) => b === 0)).toBe(true);
  });
});

// Background pictures: shrunk to screen size, kept in IndexedDB (not in the saved
// state file, so saving stays instant) and shown through object URLs.

import { useEffect, useState } from 'react';

const DB = 'kite-images';
const STORE = 'images';
/** Longest side kept: sharp on a 5K screen, small on disk. */
const MAX_SIDE = 2880;
/** Biggest file accepted before shrinking. */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const urls = new Map<string, Promise<string | null>>();
/** Pictures added since Kite started: never cleaned up in this run (one may be a preview you're about to apply). */
const addedNow = new Set<string>();

/** An object URL for a stored picture (cached), or null if it's gone. */
export function imageUrl(id: string): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = run<Blob | undefined>('readonly', (s) => s.get(id))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urls.set(id, p);
  }
  return p;
}

/** The picture's URL once it's loaded; null while loading or if missing. */
export function useImageUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!id) {
      setUrl(null);
      return;
    }
    void imageUrl(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

export class ImageError extends Error {}

/**
 * Read a picture file: shrink it to at most MAX_SIDE, store it, and measure how bright
 * it is. Returns its id and brightness (0–1).
 */
export async function addImage(file: Blob): Promise<{ id: string; luma: number }> {
  if (!file.type.startsWith('image/')) throw new ImageError('That file isn’t a picture.');
  if (file.size > MAX_FILE_BYTES) throw new ImageError('That picture is over 40 MB.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new ImageError('Kite can’t read that picture. Try a JPG, PNG or WebP.');
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const luma = measureLuma(canvas);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Kite couldn’t save that picture.'))), 'image/jpeg', 0.88));
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  addedNow.add(id);
  await run('readwrite', (s) => s.put(blob, id));
  urls.set(id, Promise.resolve(URL.createObjectURL(blob)));
  return { id, luma };
}

/** Average perceived brightness, from a tiny copy of the picture. */
function measureLuma(src: HTMLCanvasElement): number {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, 24, 24);
  const d = ctx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return sum / (d.length / 4);
}

/** Delete stored pictures no Space uses any more (e.g. replaced, or a preview you didn't keep). */
export async function pruneImages(keep: Iterable<string>): Promise<number> {
  const keepSet = new Set(keep);
  try {
    const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) as string[];
    const gone = keys.filter((k) => !keepSet.has(k) && !addedNow.has(k));
    for (const k of gone) {
      await run('readwrite', (s) => s.delete(k));
      const u = urls.get(k);
      urls.delete(k);
      void u?.then((x) => x && URL.revokeObjectURL(x));
    }
    return gone.length;
  } catch {
    return 0;
  }
}

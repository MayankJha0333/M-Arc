// Saves Kite's state as one JSON file in the app's data folder.
//
// - Writes go to a temp file, are flushed to disk, then replace the real file
//   in one step, so a crash mid-write can't leave a half-written file.
// - The previous save is kept as .bak (protects against a broken write).
// - Once a day a dated copy goes into backups/ (kept for 7 days), which
//   protects against mistakes that get saved, like an unwanted reset.

import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { STATE_VERSION } from '../shared/defaults';

const KEEP_DAYS = 7;

export class Storage {
  readonly file: string;
  readonly backup: string;
  readonly snapshots: string;

  constructor(dir: string, name = 'kite-data.json') {
    this.file = join(dir, name);
    this.backup = `${this.file}.bak`;
    this.snapshots = join(dir, 'backups');
    mkdirSync(dirname(this.file), { recursive: true });
  }

  /** Returns the saved JSON, or the backup if the main file is broken, or null. */
  load(): unknown {
    for (const f of [this.file, this.backup]) {
      if (!existsSync(f)) continue;
      try {
        const data = JSON.parse(readFileSync(f, 'utf8'));
        // Written by a newer Kite? Keep an untouched copy before this version saves over it.
        const v = (data as { version?: number })?.version;
        if (typeof v === 'number' && v > STATE_VERSION) {
          const keep = join(dirname(this.file), `kite-data.from-newer-version-${v}.json`);
          if (!existsSync(keep)) copyFileSync(f, keep);
        }
        return data;
      } catch {
        // fall through to the backup
      }
    }
    return null;
  }

  save(json: string): void {
    JSON.parse(json); // never write something we couldn't read back
    const tmp = `${this.file}.tmp`;
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, json, 0, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(this.file)) {
      try {
        copyFileSync(this.file, this.backup);
      } catch {
        /* backup is best effort */
      }
    }
    renameSync(tmp, this.file);
  }

  /** Keep one dated copy per day for a week. Call once at startup. */
  snapshot(today = new Date()): string | null {
    if (!existsSync(this.file)) return null;
    mkdirSync(this.snapshots, { recursive: true });
    const day = today.toISOString().slice(0, 10);
    const target = join(this.snapshots, `kite-data-${day}.json`);
    if (!existsSync(target)) copyFileSync(this.file, target);
    const files = readdirSync(this.snapshots)
      .filter((f) => /^kite-data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) {
      try {
        unlinkSync(join(this.snapshots, old));
      } catch {
        /* ignore */
      }
    }
    return target;
  }
}

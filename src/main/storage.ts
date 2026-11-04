// Saves Kite's state as one JSON file in the app's data folder.
// Writes go to a temp file first, then replace the real file in one step,
// so a crash mid-write can never leave a half-written file.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class Storage {
  readonly file: string;
  readonly backup: string;

  constructor(dir: string, name = 'kite-data.json') {
    this.file = join(dir, name);
    this.backup = `${this.file}.bak`;
    mkdirSync(dirname(this.file), { recursive: true });
  }

  /** Returns the saved JSON, or the backup if the main file is broken, or null. */
  load(): unknown {
    for (const f of [this.file, this.backup]) {
      if (!existsSync(f)) continue;
      try {
        return JSON.parse(readFileSync(f, 'utf8'));
      } catch {
        // fall through to the backup
      }
    }
    return null;
  }

  save(json: string): void {
    JSON.parse(json); // never write something we couldn't read back
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, json, 'utf8');
    if (existsSync(this.file)) {
      try {
        copyFileSync(this.file, this.backup);
      } catch {
        /* backup is best effort */
      }
    }
    renameSync(tmp, this.file);
  }
}

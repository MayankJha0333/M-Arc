// Bundles the Electron main + preload processes with esbuild.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'koffi'],
  sourcemap: true,
  logLevel: 'warning',
};

await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs' });
await build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs' });
console.log('main + preload built');

// Dev mode: Vite dev server for the UI + Electron pointed at it.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
await import('./build-main.mjs');
const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, KITE_DEV_URL: url } });
child.on('exit', async () => { await server.close(); process.exit(0); });

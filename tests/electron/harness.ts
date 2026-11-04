import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A tiny local website for real-browser tests. */
export function startSite(): Promise<{ server: Server; url: (path?: string) => string; other: (path?: string) => string }> {
  const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
  const server = createServer((req, res) => {
    const host = req.headers.host ?? '';
    res.setHeader('content-type', 'text/html');
    if (req.url?.startsWith('/two')) return res.end(page('Page Two', '<h1 id="h">Two</h1>'));
    if (req.url?.startsWith('/video'))
      return res.end(
        page(
          'Video Page',
          `<canvas id="c" width="640" height="360" style="display:none"></canvas>
           <video id="v" width="640" height="360" muted autoplay playsinline></video>
           <script>
             const c = document.getElementById('c'), x = c.getContext('2d'); let t = 0;
             setInterval(() => { x.fillStyle = 'hsl(' + (t++ * 7 % 360) + ' 70% 50%)'; x.fillRect(0, 0, 640, 360); }, 40);
             const v = document.getElementById('v'); v.srcObject = c.captureStream(25); v.play();
           </script>`,
        ),
      );
    if (req.url?.startsWith('/article')) return res.end(page(`Article on ${host}`, '<h1 id="h">Article</h1>'));
    res.end(
      page(
        'Kite Test Home',
        `<h1 id="h">Home</h1>
         <a id="same" href="/two">same site</a>
         <a id="external" href="http://localhost:${(server.address() as { port: number }).port}/article">other host</a>
         <a id="blank" href="/two" target="_blank">blank</a>
         <div id="ad" style="height:40px;background:gold">AD</div>`,
      ),
    );
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, url: (p = '/') => `http://127.0.0.1:${port}${p}`, other: (p = '/') => `http://localhost:${port}${p}` });
    }),
  );
}

export async function launch(userData?: string, extraArgs: string[] = [], env: Record<string, string> = {}): Promise<{ app: ElectronApplication; win: Page; userData: string }> {
  const dir = userData ?? mkdtempSync(join(tmpdir(), 'kite-e2e-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox', ...extraArgs],
    env: { ...process.env, KITE_USER_DATA: dir, KITE_TEST: '1', ...env } as Record<string, string>,
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid=sidebar]');
  return { app, win, userData: dir };
}

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

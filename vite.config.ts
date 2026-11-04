import { defineConfig, type Plugin } from 'vite';

// Strict Content-Security-Policy for Kite's own UI in the built app.
// (Left out of the dev/test server, which needs inline scripts for hot reload.)
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'";
const cspPlugin: Plugin = {
  name: 'kite-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), cspPlugin],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  build: { outDir: resolve(__dirname, 'dist/renderer'), emptyOutDir: true },
  server: { port: 5174, strictPort: true },
});

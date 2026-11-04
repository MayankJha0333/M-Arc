// Renders Kite's app icon (build/icon.png, 1024×1024) from the logo.
import { chromium } from 'playwright';
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbe2c8"/><stop offset="1" stop-color="#e58f65"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <g transform="translate(232 150) scale(11.7)">
    <path d="M24 3 L38 19 L24 33 L10 19 Z" fill="#c4553a"/>
    <path d="M24 3 L38 19 L24 19 Z" fill="#ffd6b8" opacity=".95"/>
    <path d="M10 19 L24 33 L24 19 Z" fill="#ffd6b8" opacity=".6"/>
    <path d="M24 3 V33 M10 19 H38" stroke="#3a2418" stroke-width="1.2" opacity=".55" fill="none"/>
    <path d="M24 33 C 22 37, 28 39, 25 42 S 21 45, 24 47" stroke="#3a2418" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M23 38 l-3 -1.5 M26 42.5 l3 -1" stroke="#c4553a" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await p.locator('svg').screenshot({ path: 'build/icon.png', omitBackground: true });
await b.close();
console.log('build/icon.png written');

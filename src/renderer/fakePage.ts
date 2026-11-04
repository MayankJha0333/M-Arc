// Test-mode web pages. Each URL gets a small generated page with known links
// and elements, so end-to-end tests can click real links and see real effects.

import { hostOf } from '@shared/url';

export function fakeTitle(url: string): string {
  try {
    const u = new URL(url);
    const host = hostOf(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    if (u.searchParams.get('q')) return `${u.searchParams.get('q')} - Search`;
    return `${host}${path}`;
  } catch {
    return url;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function fakePageHtml(url: string): string {
  const title = escapeHtml(fakeTitle(url));
  const host = escapeHtml(hostOf(url));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font:16px/1.5 Georgia,serif;margin:0;color:#222;background:#fbfaf7}
  header{padding:14px 28px;border-bottom:1px solid #e7e2da;font:600 13px system-ui;letter-spacing:.04em;text-transform:uppercase;color:#8a8170}
  main{max-width:640px;margin:40px auto;padding:0 28px}
  h1{font-size:34px;line-height:1.15;margin:0 0 12px}
  a{color:#b2442b}
  ul{padding-left:18px}
  .banner{margin:28px 0;padding:18px;border-radius:10px;background:#ffe9a8;font:600 14px system-ui}
</style></head><body>
<header id="site-header">${host}</header>
<main>
  <h1 id="title">${title}</h1>
  <p id="lede">A simulated page used in Kite's test mode. Real pages load in the desktop app.</p>
  <ul>
    <li><a id="same" href="/page-2">Same-site link</a></li>
    <li><a id="external" href="https://elsewhere.test/article">Link to another site</a></li>
    <li><a id="blank" href="https://newtab.test/" target="_blank">Opens in a new tab</a></li>
  </ul>
  <div id="ad" class="banner">Sponsored banner</div>
  <p data-url="${escapeHtml(url)}">${escapeHtml(url)}</p>
</main></body></html>`;
}

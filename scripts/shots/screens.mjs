// Takes a screenshot of the running web UI. Usage: node tests/e2e/screens.mjs <out.png> [script]
import { chromium } from 'playwright';
const [out, scenario = 'empty', theme = 'light'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: theme });
await page.goto('http://localhost:5174/?platform=darwin');
await page.waitForSelector('[data-testid=sidebar]');
const mod = 'Meta';
async function tab(u) { await page.keyboard.press(`${mod}+t`); await page.fill('[data-testid=cb-input]', u); await page.press('[data-testid=cb-input]', 'Enter'); await page.waitForTimeout(150); }
if (scenario !== 'empty') {
  for (const u of ['github.com/torvalds/linux', 'news.ycombinator.com', 'en.wikipedia.org/wiki/Kite', 'figma.com']) await tab(u);
}
if (scenario === 'script' && process.argv[5]) await (await import(process.argv[5])).default(page);
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();

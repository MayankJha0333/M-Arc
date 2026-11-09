#!/usr/bin/env node
// One command for every system: `npm run test:report`
//
// Runs everything this computer can check — type check, logic tests, UI tests, tests in
// the real app, and on macOS the floating-video checks on the real desktop — then writes
// a report to test-report/:
//   report.html   open in a browser: ✅/❌ per feature, every failure with its reason, logs, screenshots
//   summary.md    the same in short text
//   results.json  everything, for tools (and for Claude to read)
//   logs/         full output of each step, and Kite's own debug log
//   files/        screenshots and other attachments
//
// Works on macOS, Linux and Windows. Exit code 1 if anything failed.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test-report');
const RAW = join(OUT, 'raw');
const LOGS = join(OUT, 'logs');
const FILES = join(OUT, 'files');
const OS = platform();
const OS_NAME = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[OS] ?? OS;
const WIN = OS === 'win32';
const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick'); // skip the slow UI tests

rmSync(OUT, { recursive: true, force: true });
for (const d of [RAW, LOGS, FILES]) mkdirSync(d, { recursive: true });

const startedAt = new Date();
const steps = [];
const tests = [];

// ---- running steps -------------------------------------------------------------------

function hasCommand(cmd) {
  return spawnSync(WIN ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

/** Run a command, streaming a short status line and saving full output to logs/<id>.log. */
function run(id, cmd, cmdArgs, env = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    const logFile = join(LOGS, `${id}.log`);
    let output = '';
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', ...env }, shell: WIN });
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      writeFileSync(logFile, output);
      done({ code: code ?? 1, output, ms: Date.now() - t0, log: relative(OUT, logFile) });
    });
    child.on('error', (err) => {
      output += `\n${err.message}`;
      writeFileSync(logFile, output);
      done({ code: 1, output, ms: Date.now() - t0, log: relative(OUT, logFile) });
    });
  });
}

/** A step that must work for the rest to make sense (build, type check). */
async function step(id, name, cmd, cmdArgs, env) {
  process.stdout.write(`• ${name} … `);
  const r = await run(id, cmd, cmdArgs, env);
  const ok = r.code === 0;
  steps.push({ id, name, status: ok ? 'passed' : 'failed', durationMs: r.ms, log: r.log, tail: ok ? '' : r.output.trim().split('\n').slice(-25).join('\n') });
  console.log(ok ? `ok (${secs(r.ms)})` : `FAILED (see ${r.log})`);
  return ok;
}

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

// ---- reading results -----------------------------------------------------------------

const FEATURES = {
  // unit test files
  arcImport: 'Import from Arc', archive: 'Archive & auto-archive', boosts: 'Boosts', commandbar: 'Command bar', folders: 'Folders',
  links: 'Links & Peek', notes: 'Notes', objcPanel: 'Floating video · macOS window', persistence: 'Saving your data',
  'pinned-favorites': 'Pinned tabs & Favorites', pip: 'Video pop-out', pipFrame: 'Floating video · controls & mini player',
  pipWindow: 'Floating video · macOS window', routing: 'Link routing', settings: 'Settings & backups', shortcuts: 'Keyboard shortcuts',
  spaces: 'Spaces', split: 'Split view', tabs: 'Sidebar tabs', url: 'Addresses & search',
  // UI test files
  '01-tabs': 'Sidebar tabs', '02-pinned-favorites': 'Pinned tabs & Favorites', '03-folders-dnd': 'Folders', '04-spaces': 'Spaces',
  '05-archive': 'Archive & auto-archive', '06-command-bar': 'Command bar', '07-split-view': 'Split view', '08-peek': 'Links & Peek',
  '09-little-window': 'Little window', '10-boosts': 'Boosts', '11-routing': 'Link routing', '12-notes': 'Notes',
  '13-import-arc': 'Import from Arc', '14-settings': 'Settings & backups', '15-video-popout': 'Video pop-out',
  '16-pip-frame': 'Floating video · controls & mini player',
  // real app
  packaged: 'Packaged app', 'floating-video.mac': 'Floating video · on the real Mac desktop',
};

function featureOf(file, title) {
  const key = basename(file).replace(/\.(test|spec)\.ts$/, '');
  if (key === 'app') {
    const t = title.toLowerCase();
    if (/floating video|controls/.test(t)) return 'Floating video · controls & mini player';
    if (/video|pop-out|picture/.test(t)) return 'Video pop-out';
    if (/little/.test(t)) return 'Little window';
    if (/boost|zap/.test(t)) return 'Boosts';
    if (/attack|permission|protocol|popup|navigation|security|spoof/.test(t)) return 'Security';
    if (/save|backup|restore|quit|data/.test(t)) return 'Saving your data';
    if (/link|peek/.test(t)) return 'Links & Peek';
    return 'Real app basics';
  }
  return FEATURES[key] ?? key;
}

/** The useful part of an error: no colour codes, no lines from inside the test tools. */
const firstLines = (s, n = 12) =>
  String(s ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .filter((l) => !/node_modules|node:internal|processTicksAndRejections/.test(l))
    .slice(0, n)
    .join('\n');

function readVitest(file) {
  if (!existsSync(file)) return false;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  for (const f of j.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      const status = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      tests.push({
        layer: 'Logic', feature: featureOf(f.name, a.title), file: relative(ROOT, f.name),
        title: [...(a.ancestorTitles ?? []), a.title].join(' › '), status, durationMs: Math.round(a.duration ?? 0),
        error: status === 'failed' ? firstLines((a.failureMessages ?? []).join('\n'), 20) : '', attachments: [],
      });
    }
  }
  return true;
}

function readPlaywright(file, layer) {
  if (!existsSync(file)) return false;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  let n = 0;
  const walk = (suite, titles, fileName) => {
    for (const s of suite.suites ?? []) walk(s, s.title && s.title !== fileName && !s.title.endsWith('.ts') ? [...titles, s.title] : titles, s.file ?? fileName);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1] ?? {};
        const status = t.status === 'skipped' ? 'skipped' : t.status === 'expected' ? 'passed' : t.status === 'flaky' ? 'flaky' : 'failed';
        const attachments = [];
        for (const r of results) {
          for (const a of r.attachments ?? []) {
            if (!a.path || !existsSync(a.path)) continue;
            const dest = join(FILES, `${String(++n).padStart(3, '0')}-${basename(a.path)}`);
            cpSync(a.path, dest);
            attachments.push({ name: a.name, path: relative(OUT, dest), type: a.contentType });
          }
        }
        const fileRel = spec.file ?? fileName ?? '';
        tests.push({
          layer, feature: featureOf(fileRel, spec.title), file: fileRel, title: [...titles, spec.title].join(' › '), status,
          durationMs: results.reduce((s, r) => s + (r.duration ?? 0), 0),
          error: status === 'failed' || status === 'flaky' ? firstLines(last.error?.message ?? results.find((r) => r.error)?.error?.message, 20) : '',
          attachments,
        });
      }
    }
  };
  for (const s of j.suites ?? []) walk(s, [], s.file ?? s.title);
  for (const e of j.errors ?? []) tests.push({ layer, feature: 'Test setup', file: '', title: 'Could not run these tests', status: 'failed', durationMs: 0, error: firstLines(e.message, 20), attachments: [] });
  return true;
}

/** A whole group of tests that didn't produce results at all (crashed, missing browser…). */
function groupFailed(layer, name, r) {
  tests.push({ layer, feature: 'Test setup', file: '', title: `${name} did not run`, status: 'failed', durationMs: r.ms, error: firstLines(r.output.split('\n').slice(-30).join('\n'), 30), attachments: [{ name: 'full output', path: r.log, type: 'text/plain' }] });
}

async function playwrightGroup(id, layer, name, config, env = {}) {
  process.stdout.write(`• ${name} … `);
  const json = join(RAW, `${id}.json`);
  let cmd = 'npx';
  let cmdArgs = ['playwright', 'test', '-c', config, '--reporter=json'];
  if (OS === 'linux' && !process.env.DISPLAY && hasCommand('xvfb-run') && id !== 'ui') {
    cmdArgs = ['-a', cmd, ...cmdArgs];
    cmd = 'xvfb-run';
  }
  const r = await run(id, cmd, cmdArgs, { PLAYWRIGHT_JSON_OUTPUT_NAME: json, ...env });
  const before = tests.length;
  if (!readPlaywright(json, layer)) groupFailed(layer, name, r);
  const mine = tests.slice(before);
  const failed = mine.filter((t) => t.status === 'failed').length;
  steps.push({ id, name, status: failed ? 'failed' : 'passed', durationMs: r.ms, log: r.log, tail: '' });
  console.log(`${mine.length - failed - mine.filter((t) => t.status === 'skipped').length} passed, ${failed} failed (${secs(r.ms)})`);
}

// ---- the run -------------------------------------------------------------------------

console.log(`\nKite test report — ${OS_NAME} ${release()} (${arch()})\n`);

const typecheckOk = await step('typecheck', 'Type check', 'npx', ['tsc', '--noEmit', '-p', '.']);

process.stdout.write('• Logic tests … ');
{
  const json = join(RAW, 'logic.json');
  const r = await run('logic', 'npx', ['vitest', 'run', '--reporter=json', `--outputFile=${json}`]);
  const before = tests.length;
  if (!readVitest(json)) groupFailed('Logic', 'Logic tests', r);
  const mine = tests.slice(before);
  const failed = mine.filter((t) => t.status === 'failed').length;
  steps.push({ id: 'logic', name: 'Logic tests', status: failed ? 'failed' : 'passed', durationMs: r.ms, log: r.log, tail: '' });
  console.log(`${mine.length - failed} passed, ${failed} failed (${secs(r.ms)})`);
}

if (!QUICK) {
  // The UI tests need Playwright's own Chromium; fetch it once if it's missing.
  await step('browsers', 'Browser for UI tests (download once)', 'npx', ['playwright', 'install', 'chromium']);
  await playwrightGroup('ui', 'UI', 'UI tests (simulated pages)', 'playwright.web.config.ts');
}

const built = await step('build', 'Build the app', 'npm', ['run', 'build']);
if (built) {
  await playwrightGroup('app', 'Real app', `Real app tests (Electron on ${OS_NAME})`, 'playwright.electron.config.ts', {
    KITE_DEBUG_LOG: join(LOGS, 'kite-debug-app.log'),
  });
  if (OS === 'darwin') {
    console.log('  (macOS checks use the real desktop — please don’t touch the mouse or keyboard for about a minute)');
    await playwrightGroup('mac', 'macOS desktop', 'macOS desktop checks (floating video)', 'playwright.mac.config.ts', {
      KITE_MAC_TEST_LOG: join(LOGS, 'kite-debug-mac.log'),
    });
  }
}

// ---- writing the report --------------------------------------------------------------

const count = (list, s) => list.filter((t) => t.status === s).length;
const totals = { passed: count(tests, 'passed'), failed: count(tests, 'failed'), flaky: count(tests, 'flaky'), skipped: count(tests, 'skipped') };
const brokenSteps = steps.filter((s) => s.status === 'failed' && !['logic', 'ui', 'app', 'mac'].includes(s.id));
const ok = totals.failed === 0 && brokenSteps.length === 0 && typecheckOk && built;

const byFeature = new Map();
for (const t of tests) {
  const f = byFeature.get(t.feature) ?? { feature: t.feature, passed: 0, failed: 0, flaky: 0, skipped: 0, layers: new Set() };
  f[t.status]++;
  f.layers.add(t.layer);
  byFeature.set(t.feature, f);
}
const features = [...byFeature.values()]
  .map((f) => ({ ...f, layers: [...f.layers], status: f.failed ? 'failed' : f.flaky ? 'flaky' : f.passed ? 'passed' : 'skipped' }))
  .sort((a, b) => (a.status === 'failed') === (b.status === 'failed') ? a.feature.localeCompare(b.feature) : a.status === 'failed' ? -1 : 1);

let commit = '';
try {
  commit = spawnSync('git', ['log', '-1', '--format=%h %s'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
} catch {
  /* not a git checkout */
}
let electronVersion = '';
try {
  electronVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules/electron/package.json'), 'utf8')).version;
} catch {
  /* not installed */
}

const meta = {
  os: OS_NAME, osVersion: release(), arch: arch(), node: process.version, electron: electronVersion, commit,
  startedAt: startedAt.toISOString(), durationMs: Date.now() - startedAt.getTime(), quick: QUICK,
  notCovered: [
    ...(OS !== 'darwin' ? ['macOS desktop checks (floating video over other apps) — run this on a Mac'] : []),
    ...(QUICK ? ['UI tests (skipped with --quick)'] : []),
    'How things look — screenshots are attached where available; judge them by eye',
  ],
};
const failures = tests.filter((t) => t.status === 'failed' || t.status === 'flaky');

writeFileSync(join(OUT, 'results.json'), JSON.stringify({ ok, meta, totals, steps, features, tests }, null, 2));

// summary.md
{
  const L = [];
  L.push(`# Kite test report — ${ok ? '✅ all working' : `❌ ${totals.failed + brokenSteps.length} problem(s)`}`, '');
  L.push(`${meta.os} ${meta.osVersion} (${meta.arch}) · Node ${meta.node} · Electron ${meta.electron} · ${meta.commit}`);
  L.push(`${startedAt.toLocaleString()} · took ${secs(meta.durationMs)}`, '');
  L.push(`**${totals.passed} passed · ${totals.failed} failed · ${totals.flaky} flaky · ${totals.skipped} skipped**`, '');
  if (brokenSteps.length) {
    L.push('## Steps that broke', '');
    for (const s of brokenSteps) L.push(`- ❌ **${s.name}** — see \`${s.log}\``, '', '```', s.tail, '```', '');
  }
  L.push('## Features', '', '| | Feature | Passed | Failed | Checked in |', '|---|---|---|---|---|');
  for (const f of features) L.push(`| ${f.status === 'failed' ? '❌' : f.status === 'flaky' ? '⚠️' : f.status === 'passed' ? '✅' : '⏭️'} | ${f.feature} | ${f.passed} | ${f.failed + f.flaky} | ${f.layers.join(', ')} |`);
  if (failures.length) {
    L.push('', '## What failed, and why', '');
    for (const t of failures) {
      L.push(`### ${t.status === 'flaky' ? '⚠️ (passed on retry)' : '❌'} ${t.feature} — ${t.title}`, `${t.layer} · \`${t.file}\``, '', '```', t.error || '(no message)', '```');
      for (const a of t.attachments) L.push(`- ${a.name}: \`${a.path}\``);
      L.push('');
    }
  }
  L.push('## Not covered by this run', '', ...meta.notCovered.map((n) => `- ${n}`), '');
  L.push('## Logs', '', ...steps.map((s) => `- ${s.name}: \`${s.log}\``));
  if (existsSync(join(LOGS, 'kite-debug-mac.log'))) L.push('- Kite debug log (macOS checks): `logs/kite-debug-mac.log`');
  writeFileSync(join(OUT, 'summary.md'), L.join('\n') + '\n');
}

// report.html
{
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const icon = (s) => ({ passed: '✅', failed: '❌', flaky: '⚠️', skipped: '⏭️' })[s] ?? '•';
  const att = (a) =>
    a.type?.startsWith('image/')
      ? `<a href="${esc(a.path)}"><img src="${esc(a.path)}" alt="${esc(a.name)}" loading="lazy"></a>`
      : `<a class="file" href="${esc(a.path)}">${esc(a.name)}</a>`;
  const testRow = (t) => `
    <details class="t" data-status="${t.status}" ${t.status === 'failed' ? 'open' : ''}>
      <summary><span>${icon(t.status)}</span><span class="tt">${esc(t.title)}</span><span class="muted">${esc(t.layer)} · ${(t.durationMs / 1000).toFixed(1)}s</span></summary>
      <div class="tb">
        <div class="muted mono">${esc(t.file)}</div>
        ${t.error ? `<pre>${esc(t.error)}</pre>` : ''}
        ${t.attachments.length ? `<div class="att">${t.attachments.map(att).join('')}</div>` : ''}
      </div>
    </details>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kite test report</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1d22;--muted:#6a6f7a;--line:#e3e5ea;--ok:#1f8a4c;--bad:#c9353b;--warn:#b7791f;--chip:#eef0f4}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--card:#1b1d22;--text:#eceef2;--muted:#9a9fab;--line:#2c2f36;--ok:#4cc38a;--bad:#ff6b6b;--warn:#f0b35a;--chip:#262930}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
main{max-width:1000px;margin:0 auto;padding:28px 16px 60px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}
.muted{color:var(--muted)}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.hero{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.big{font-size:20px;font-weight:700}.big.ok{color:var(--ok)}.big.bad{color:var(--bad)}
.stats{display:flex;gap:8px;flex-wrap:wrap}.stat{background:var(--chip);border-radius:999px;padding:4px 12px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.f{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start}
.f[data-status=failed]{border-color:var(--bad)}.f b{display:block}.f small{color:var(--muted)}
.bar{display:flex;gap:6px;margin:8px 0}.bar button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:4px 12px;cursor:pointer}
.bar button[aria-pressed=true]{background:var(--text);color:var(--bg)}
.t{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:6px 0}.t[data-status=failed]{border-color:var(--bad)}
.t summary{display:flex;gap:10px;align-items:center;padding:9px 12px;cursor:pointer;list-style:none}.t summary::-webkit-details-marker{display:none}
.tt{flex:1;min-width:0}.tb{padding:0 12px 12px 38px}
pre{white-space:pre-wrap;word-break:break-word;background:var(--chip);border-radius:8px;padding:10px;font:12px/1.45 ui-monospace,Menlo,monospace;max-height:360px;overflow:auto}
.att{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.att img{max-width:300px;max-height:200px;border-radius:8px;border:1px solid var(--line)}
.file{background:var(--chip);border-radius:6px;padding:3px 8px;color:inherit}
.step{display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}.step:last-child{border:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 14px}
a{color:inherit}
</style></head><body><main>
<h1>Kite test report</h1>
<div class="muted">${esc(meta.os)} ${esc(meta.osVersion)} (${esc(meta.arch)}) · Node ${esc(meta.node)} · Electron ${esc(meta.electron)} · ${esc(meta.commit)}<br>${esc(startedAt.toLocaleString())} · took ${secs(meta.durationMs)}</div>
<h2></h2>
<div class="hero"><div class="big ${ok ? 'ok' : 'bad'}">${ok ? '✅ Everything checked is working' : `❌ ${totals.failed + brokenSteps.length} problem(s) found`}</div>
<div class="stats"><span class="stat">✅ ${totals.passed}</span><span class="stat">❌ ${totals.failed}</span><span class="stat">⚠️ ${totals.flaky}</span><span class="stat">⏭️ ${totals.skipped}</span></div></div>
${brokenSteps.length ? `<h2>Steps that broke</h2>${brokenSteps.map((s) => `<div class="t" data-status="failed"><div class="tb" style="padding:12px"><b>❌ ${esc(s.name)}</b> — <a href="${esc(s.log)}">full log</a><pre>${esc(s.tail)}</pre></div></div>`).join('')}` : ''}
<h2>Features</h2>
<div class="grid">${features.map((f) => `<div class="f" data-status="${f.status}"><span>${icon(f.status)}</span><div><b>${esc(f.feature)}</b><small>${f.passed} passed${f.failed ? ` · ${f.failed} failed` : ''}${f.flaky ? ` · ${f.flaky} flaky` : ''}${f.skipped ? ` · ${f.skipped} skipped` : ''} · ${esc(f.layers.join(', '))}</small></div></div>`).join('')}</div>
<h2>Every check</h2>
<div class="bar" role="group" aria-label="Show"><button aria-pressed="${failures.length ? 'false' : 'true'}" data-show="all">All</button><button aria-pressed="${failures.length ? 'true' : 'false'}" data-show="problems">Problems only</button></div>
<div id="tests">${features.map((f) => `<h2>${icon(f.status)} ${esc(f.feature)}</h2>${tests.filter((t) => t.feature === f.feature).map(testRow).join('')}`).join('')}</div>
<h2>Steps</h2><div class="card">${steps.map((s) => `<div class="step"><span>${icon(s.status)}</span><span style="flex:1">${esc(s.name)}</span><span class="muted">${secs(s.durationMs)}</span><a class="file" href="${esc(s.log)}">log</a></div>`).join('')}
${existsSync(join(LOGS, 'kite-debug-mac.log')) ? `<div class="step"><span>📄</span><span style="flex:1">Kite debug log (macOS checks)</span><a class="file" href="logs/kite-debug-mac.log">log</a></div>` : ''}</div>
<h2>Not covered by this run</h2><div class="card">${meta.notCovered.map((n) => `<div class="step"><span>➖</span><span>${esc(n)}</span></div>`).join('')}</div>
</main>
<script>
const bar = document.querySelector('.bar');
function show(mode){
  bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.show === mode)));
  document.querySelectorAll('.t').forEach(t => { t.hidden = mode === 'problems' && !['failed','flaky'].includes(t.dataset.status); });
  document.querySelectorAll('#tests h2').forEach(h => { let n = h.nextElementSibling, any = false; while (n && n.tagName !== 'H2') { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; });
}
bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.show); });
show(${failures.length ? "'problems'" : "'all'"});
</script></body></html>`;
  writeFileSync(join(OUT, 'report.html'), html);
}

console.log(`\n${ok ? '✅ Everything checked is working' : `❌ ${totals.failed + brokenSteps.length} problem(s) found`} — ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped`);
console.log(`Report: ${join(OUT, 'report.html')}\n`);
process.exit(ok ? 0 : 1);

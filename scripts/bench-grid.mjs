#!/usr/bin/env node
/* eslint-env node */
/*
 * The Library grid benchmark (docs/library-grid-performance.md). Launches
 * headless Chrome on a fresh profile (cold caches), opens <url> and measures
 * over the DevTools protocol: load (long tasks, blocking time, CLS, DOM
 * size), fast scrolling down and back up (frames, drops, long tasks, cards
 * that move against the rest on screen, blank frames), filter toggles and
 * search typing. Prints JSON. No dependencies: Node's own WebSocket.
 *
 *   node scripts/bench-grid.mjs http://localhost:4173/library [label]
 *
 * Point it at fixture data only (`VITE_MEMEX_FIXTURES=large`), never at a
 * signed-in production account. CHROME=<path> overrides the browser.
 * SHIFTS=1 prints the page's layout-shift sources after load instead
 * (SHIFTS=reload: after a second, warm load).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, label = 'run'] = process.argv.slice(2);
if (!url) {
  console.error('Usage: node scripts/bench-grid.mjs <url> [label]');
  process.exit(1);
}
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(process.env.BENCH_TMP ?? tmpdir(), 'memex-bench-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--force-device-scale-factor=2', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* starting */ }
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const msg = JSON.parse(e.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((resolve) => { id += 1; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 60000 });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 500));
  return res.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  window.__cls = 0; window.__shifts = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: e.sources.map((s) => { const n = s.node; return [n ? (n.className || n.nodeName).toString().slice(0, 60) : '?', Math.round(s.previousRect.y), Math.round(s.currentRect.y), Math.round(s.previousRect.height), Math.round(s.currentRect.height)]; }) }); } })).observe({ type: 'layout-shift', buffered: true });
` });
await send('Page.navigate', { url });
const results = { label };
await sleep(6000);
if (process.env.SHIFTS === 'reload') { await send('Page.reload', {}); await sleep(6000); }
if (process.env.SHIFTS) {
  console.log(JSON.stringify(await evaluate('window.__shifts'), null, 1));
  chrome.kill();
  process.exit(0);
}
results.load = await evaluate(`(async () => {
  const lts = window.__lt;
  const lcp = performance.getEntriesByType('largest-contentful-paint').map((e) => Math.round(e.startTime)).pop();
  return { longTasks: lts.length, longestTask: Math.max(0, ...lts), totalBlockingMs: lts.reduce((s, d) => s + Math.max(0, d - 50), 0), lcp, cls: +window.__cls.toFixed(4),
    domNodes: document.querySelectorAll('*').length, mountedCards: document.querySelectorAll('[data-item-key]').length };
})()`);

// 2. Scrolling: frames, drops, long tasks, visible shifts (cards moving against the rest), blank frames
const scrollBench = (step, ms) => evaluate(`(async () => {
  const STEP = ${step}, MS = ${ms};
  const sc = document.querySelector('.memex-grid-view');
  const grid = document.querySelector('.memex-masonry'); const sr = sc.getBoundingClientRect(); const gr = grid.getBoundingClientRect();
  const pts = []; for (let fx = 0.1; fx < 1; fx += 0.2) for (let fy = 0.1; fy < 1; fy += 0.2) pts.push([gr.left + gr.width * fx, sr.top + sr.height * fy]);
  const lts = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => lts.push(e.duration))); po.observe({ type: 'longtask' });
  let prev = new Map(); let shifts = 0, shiftPx = 0, blank = 0, maxNodes = 0, maxCards = 0; const deltas = []; let last = null; const t0 = performance.now();
  const clsStart = window.__cls;
  await new Promise((res) => { const f = (ts) => { if (last !== null) deltas.push(ts - last); last = ts; const now = new Map(); let misses = 0;
    for (const [x, y] of pts) { const el = document.elementFromPoint(x, y); const card = el && el.closest('[data-item-key]'); if (!card) { misses++; continue; } if (!now.has(card.dataset.itemKey)) now.set(card.dataset.itemKey, card.getBoundingClientRect().top); }
    const moves = []; for (const [k, top] of now) if (prev.has(k)) moves.push(top - prev.get(k));
    if (moves.length > 1) { const s = moves.slice().sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)]; for (const m of moves) if (Math.abs(m - med) > 1.5) { shifts++; shiftPx += Math.abs(m - med); } }
    prev = now; if (misses > pts.length / 2) blank++;
    if (deltas.length % 15 === 0) { maxNodes = Math.max(maxNodes, document.querySelectorAll('*').length); maxCards = Math.max(maxCards, document.querySelectorAll('[data-item-key]').length); }
    sc.scrollTop += STEP; if (ts - t0 < MS && sc.scrollTop > 2 && sc.scrollTop < sc.scrollHeight - sc.clientHeight - 2) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  await new Promise((r) => setTimeout(r, 100)); po.disconnect();
  const sorted = deltas.slice().sort((a, b) => a - b);
  return { pxPerFrame: STEP, frames: deltas.length, fps: Math.round(deltas.length / (deltas.reduce((s, d) => s + d, 0) / 1000)),
    dropped: deltas.reduce((s, d) => s + Math.max(0, Math.round(d / 16.67) - 1), 0), p95Frame: Math.round(sorted[Math.floor(sorted.length * 0.95)]), longestFrame: Math.round(sorted[sorted.length - 1]),
    longTasks: lts.length, longestTask: Math.round(Math.max(0, ...lts)), visibleShifts: shifts, shiftPx: Math.round(shiftPx), blankFrames: blank, cls: +(window.__cls - clsStart).toFixed(4), maxDomNodes: maxNodes, maxMountedCards: maxCards };
})()`);
await evaluate(`document.querySelector('.memex-grid-view').scrollTop = 0`);
await sleep(500);
results.scrollDown3000 = await scrollBench(50, 3000);
results.scrollDown8400 = await scrollBench(140, 3000);
await sleep(800);
results.scrollUp6000 = await scrollBench(-100, 3000);
await evaluate(`document.querySelector('.memex-grid-view').scrollTop = 0`);
await sleep(1500);

// 3. Filter toggles: time to next paint, long tasks, worst frame in the following 700ms
results.filters = await evaluate(`(async () => {
  const chip = (t) => [...document.querySelectorAll('button.bookmark-profile-chip')].find((b) => b.textContent.trim().startsWith(t));
  const out = [];
  for (const label of ['Notes', 'Notes', 'Links', 'Links']) {
    const lts = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => lts.push(Math.round(e.duration)))); po.observe({ type: 'longtask' });
    const deltas = []; let last = performance.now(); let stop = false; const f = (ts) => { deltas.push(ts - last); last = ts; if (!stop) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await new Promise((r) => setTimeout(r, 100));
    const t = performance.now(); chip(label).click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); const toPaint = Math.round(performance.now() - t);
    await new Promise((r) => setTimeout(r, 700)); stop = true; po.disconnect();
    out.push({ toggle: label, toPaint, worstFrame: Math.round(Math.max(...deltas)), longTasks: lts, emptyStateShown: !!document.querySelector('.bookmark-list-empty-title') });
  }
  return out;
})()`);

// 4. Search typing: real key events through CDP, Event Timing per keystroke
await evaluate(`(() => { window.__ev = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (/key|input/.test(e.name)) window.__ev.push([e.name, Math.round(e.duration), Math.round(e.processingEnd - e.processingStart)]); })).observe({ type: 'event', durationThreshold: 16 }); window.__lt.length = 0; document.querySelector('.memex-command-input').focus(); })()`);
for (const ch of 'kitchen') {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  await sleep(110);
}
await sleep(1200);
results.search = await evaluate(`(() => ({ slowEvents: window.__ev, worstEventMs: Math.max(0, ...window.__ev.map((e) => e[1])), longTasks: window.__lt.slice(), value: document.querySelector('.memex-command-input').value, cards: document.querySelectorAll('[data-item-key]').length }))()`);

console.log(JSON.stringify(results, null, 1));
ws.close();
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });

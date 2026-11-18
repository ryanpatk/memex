#!/usr/bin/env node
/* eslint-env node */
/*
 * Spaces row check (docs/spaces-row.md), on demo data:
 *   - the sticky bar: hidden at the top; once the pills (Cards) or the
 *     heading (a space board, Tasks) scroll away it sticks with ↑ <page>,
 *     the compact pills and the gold Pinned button; ↑ goes back to the top
 *     and to the heading; pressing the page's nav item again does too
 *   - fitting: the row shows as many spaces as fit (more at 1920 than at
 *     1024), no pill runs past the row, the rest are in More in order, with
 *     “Edit spaces…” at the end
 *   - Edit spaces: Alt+↓ moves a space (the row follows, colours don't
 *     change); “In the row” off hides it from the row, but it stays in More
 *     (marked hidden), the drop tray and ⌘K
 *   - the drop tray: opens on a card drag with every space (hidden ones
 *     too), + New space and Pin; dropping files, pins, or makes a space;
 *     it closes when the drag ends
 *   - phone width (390): the bar fits and its ↑ is icon-only
 * Prints a table and exits 1 on any failure. SHOTS=<dir> saves screenshots.
 *
 *   VITE_MEMEX_FIXTURES=1 npx vite --port 5391
 *   node scripts/check-spaces.mjs http://localhost:5391
 *
 * Demo data only (VITE_MEMEX_FIXTURES): it makes spaces and files cards in
 * the in-memory fixture, which a reload forgets. Never point it at a
 * signed-in production account. CHROME=<path> overrides the browser.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base] = process.argv.slice(2);
if (!base) {
  console.error('Usage: node scripts/check-spaces.mjs <base url>');
  process.exit(1);
}
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'memex-spaces-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* starting */ }
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.slice(0, 200));
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
});
const send = (method, params = {}) => new Promise((resolve) => { id += 1; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 30000 });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 300));
  return res.result?.result?.value;
};
const size = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const go = async (path) => { await send('Page.navigate', { url: base + path }); await sleep(2200); };
const shot = async (name) => {
  if (!SHOTS) return;
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, 'base64'));
};
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: String(detail) });

// In-page helpers
const scrollTo = async (y) => { await evaluate(`document.querySelector('.mc-shell-main').scrollTop = ${y}`); await sleep(500); };
const barShown = () => evaluate(`(() => { const s = document.querySelector('.mc-stick'); if (!s) return null; const b = s.querySelector('.mc-stick-bar'); const r = b.getBoundingClientRect(); return { shown: s.classList.contains('is-shown') && getComputedStyle(b).visibility === 'visible', top: Math.round(r.top), height: Math.round(r.height), right: Math.round(r.right), title: b.querySelector('.mc-stick-top-name')?.textContent, pins: Boolean(b.querySelector('.mc-pins-btn')), pills: b.querySelectorAll('.mc-pill').length }; })()`);
const mainRow = (sel = '.mc-page .mc-pills:not(.is-compact)') => evaluate(`(() => {
  const row = document.querySelector(${JSON.stringify(sel)}); if (!row) return null;
  const r = row.getBoundingClientRect(); const right = r.right - parseFloat(getComputedStyle(row).paddingRight);
  const pills = [...row.querySelectorAll(':scope > .mc-pill, :scope > .mc-pills-fixed .mc-pill, :scope > .mc-anchor .mc-pill')];
  return { names: pills.map((p) => p.textContent.trim()), overflow: pills.some((p) => p.getBoundingClientRect().right > right + 1) };
})()`);
const spaceNames = (row) => row.names.filter((n) => n !== 'All' && n !== 'More' && n !== '');
const createSpace = async (name) => {
  await evaluate(`document.querySelector('.mc-page button[aria-label="New space"]')?.click()`);
  await sleep(400);
  await evaluate(`document.querySelector('dialog[open] input')?.focus()`);
  await send('Input.insertText', { text: name });
  await evaluate(`document.querySelector('dialog[open] form')?.requestSubmit()`);
  await sleep(700);
  // A new space opens its page; back to Cards in the app (a reload would forget it)
  await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="/library"]')?.click()`);
  await sleep(700);
};
/** Starts a drag on the first link card; resolves once the tray is up. Returns a handle id kept on window. */
const startDrag = () => evaluate(`(async () => {
  const card = [...document.querySelectorAll('[data-item-key^="link:"]')].find((c) => !c.closest('.mc-stick'));
  window.__dt = new DataTransfer(); window.__card = card;
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
  return { key: card.dataset.itemKey, pills: [...document.querySelectorAll('.mc-tray .mc-pill')].map((p) => p.textContent.trim()) };
})()`);
const dropOn = (text) => evaluate(`(async () => {
  const el = [...document.querySelectorAll('.mc-tray .mc-pill')].find((p) => p.textContent.trim() === ${JSON.stringify(text)});
  if (!el) return 'no target';
  const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientX: r.left + 10, clientY: r.top + 10 };
  el.dispatchEvent(new DragEvent('dragenter', o)); el.dispatchEvent(new DragEvent('dragover', o));
  await new Promise((r) => setTimeout(r, 60));
  el.dispatchEvent(new DragEvent('drop', o));
  window.__card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: window.__dt }));
  await new Promise((r) => setTimeout(r, 500));
  return 'ok';
})()`);
const toasts = () => evaluate(`[...document.querySelectorAll('.mc-toast')].map((t) => t.textContent).join(' | ')`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

try {
  // 1. The sticky bar on Cards
  await size(1440, 900);
  await go('/library');
  check('Cards at the top: no sticky bar', !(await barShown())?.shown);
  await scrollTo(1400);
  const bar = await barShown();
  check('Cards scrolled: the bar sticks with ↑, pills and Pinned', bar?.shown && bar.top === 0 && bar.title === 'Everything' && bar.pins && bar.pills >= 2, JSON.stringify(bar));
  await shot('bar-cards');
  await evaluate(`document.querySelector('.mc-stick-top').click()`);
  await sleep(500);
  const back = await evaluate(`({ y: document.querySelector('.mc-shell-main').scrollTop, focus: document.activeElement?.tagName })`);
  check('↑ goes back to the top and to the heading', back.y === 0 && back.focus === 'H1', JSON.stringify(back));
  await scrollTo(1400);
  await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="/library"]').click()`);
  await sleep(500);
  check('pressing Cards again goes back to the top', (await evaluate(`document.querySelector('.mc-shell-main').scrollTop`)) === 0);

  // 2. A space board and Tasks (a short window so they scroll)
  await size(1440, 520);
  await go('/spaces/sp-kitchen');
  await scrollTo(600);
  const spaceBar = await barShown();
  check('space board: the bar sticks with the space’s name', spaceBar?.shown && spaceBar.title === 'Kitchen reno', JSON.stringify(spaceBar));
  await shot('bar-space');
  await go('/tasks');
  await scrollTo(600);
  const tasksBar = await barShown();
  check('Tasks: the bar sticks', tasksBar?.shown && tasksBar.title === 'Tasks', JSON.stringify(tasksBar));
  await size(1440, 900);

  // 3. Fitting the row to the window (make enough spaces to need More)
  await go('/library');
  for (let i = 1; i <= 6; i++) await createSpace(`Extra space ${i}`);
  const at1440 = await mainRow();
  const total = await evaluate(`document.querySelectorAll('.mc-page .mc-pills:not(.is-compact) .mc-pills-measure [data-measure="space"]').length`);
  check('1440: as many as fit, none past the edge, More for the rest', at1440 && !at1440.overflow && at1440.names.includes('More') && spaceNames(at1440).length < total, `${spaceNames(at1440).length} of ${total}: ${at1440?.names.join(' · ')}`);
  await size(1024, 800);
  await sleep(500);
  const at1024 = await mainRow();
  await size(1920, 1000);
  await sleep(500);
  const at1920 = await mainRow();
  check('fewer fit at 1024, more at 1920', spaceNames(at1024).length < spaceNames(at1440).length && spaceNames(at1920).length > spaceNames(at1440).length && !at1024.overflow && !at1920.overflow, `${spaceNames(at1024).length} / ${spaceNames(at1440).length} / ${spaceNames(at1920).length}`);
  await size(1440, 900);
  await sleep(500);
  await evaluate(`[...document.querySelectorAll('.mc-page .mc-pills:not(.is-compact) button')].find((b) => b.textContent.trim() === 'More').click()`);
  await sleep(300);
  const moreItems = await evaluate(`[...document.querySelectorAll('[role="menu"][aria-label="More spaces"] [role^="menuitem"]')].map((b) => b.textContent.trim())`);
  check('More lists the rest in order, then Edit spaces…', moreItems.at(-1) === 'Edit spaces…' && moreItems.length === total - spaceNames(at1440).length + 1, moreItems.join(' · '));
  await shot('more');

  // 4. Edit spaces: move and hide
  const firstColor = await evaluate(`getComputedStyle(document.querySelector('.mc-page .mc-pills:not(.is-compact) > .mc-pill .mc-pill-dot, .mc-page .mc-pills:not(.is-compact) .mc-pill:not(.is-plain) .mc-pill-dot')).backgroundColor`);
  await evaluate(`[...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].find((b) => b.textContent.includes('Edit spaces')).click()`);
  await sleep(500);
  const before = await evaluate(`[...document.querySelectorAll('.mc-es-row .mc-es-name')].map((n) => n.textContent)`);
  check('Edit spaces opens from More with every space and the “In More” line', before.length === total && (await evaluate(`Boolean(document.querySelector('.mc-es-line'))`)), before.join(' · '));
  await evaluate(`(() => { const row = document.querySelector('.mc-es-row'); row.querySelector('.mc-es-grip').focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })); })()`);
  await sleep(500);
  const after = await evaluate(`[...document.querySelectorAll('.mc-es-row .mc-es-name')].map((n) => n.textContent)`);
  check('Alt+↓ moves the space down one place', after[0] === before[1] && after[1] === before[0], after.slice(0, 3).join(' · '));
  check('focus stays on the moved space', await evaluate(`document.activeElement?.closest('.mc-es-row')?.querySelector('.mc-es-name')?.textContent === ${JSON.stringify(before[0])}`));
  // Hide the (new) first space
  const hiddenName = after[0];
  await evaluate(`document.querySelector('.mc-es-row [role="switch"]').click()`);
  await sleep(500);
  await shot('edit-spaces');
  await evaluate(`document.querySelector('dialog[open] .mc-sheet-x, dialog[open] button[aria-label="Close"]')?.click()`);
  await sleep(500);
  const rowAfter = await mainRow();
  check('the row follows the new order', spaceNames(rowAfter)[0] === before[0], spaceNames(rowAfter).slice(0, 3).join(' · '));
  check('a hidden space leaves the row', !spaceNames(rowAfter).includes(hiddenName), `${hiddenName} not in ${spaceNames(rowAfter).join(' · ')}`);
  const movedColor = await evaluate(`(() => { const p = [...document.querySelectorAll('.mc-page .mc-pills:not(.is-compact) .mc-pill')].find((x) => x.textContent.trim() === ${JSON.stringify(before[0])}); return p ? getComputedStyle(p.querySelector('.mc-pill-dot')).backgroundColor : null; })()`);
  check('colours stay with the space, not the place', movedColor === firstColor, `${movedColor} vs ${firstColor}`);
  await evaluate(`[...document.querySelectorAll('.mc-page .mc-pills:not(.is-compact) button')].find((b) => b.textContent.trim() === 'More').click()`);
  await sleep(300);
  const moreHidden = await evaluate(`[...document.querySelectorAll('[role="menu"][aria-label="More spaces"] [role^="menuitem"]')].map((b) => b.textContent.trim())`);
  check('the hidden space is in More, marked hidden', moreHidden.some((t) => t.startsWith(hiddenName) && t.endsWith('hidden')), moreHidden.join(' · '));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await evaluate(`document.activeElement?.blur()`);
  await sleep(200);

  // 5. The drop tray (scrolled down, where the pills are out of reach)
  await scrollTo(1200);
  const drag = await startDrag();
  check('a card drag opens the tray with every space, + New space and Pin', drag.pills.length === total + 2 && drag.pills.includes(hiddenName) && drag.pills.includes('New space') && drag.pills.includes('Pin'), drag.pills.join(' · '));
  await shot('tray');
  const lastSpace = drag.pills[total - 1];
  await dropOn(lastSpace);
  const filed = await toasts();
  check('dropping on a space from More files the card', filed.includes(lastSpace), filed);
  check('the tray closes when the drag ends', !(await evaluate(`Boolean(document.querySelector('.mc-tray'))`)));
  const pinnedBefore = await evaluate(`document.querySelector('.mc-top .mc-pins-btn').getAttribute('aria-label')`);
  await startDrag();
  await dropOn('Pin');
  const pinnedAfter = await evaluate(`document.querySelector('.mc-top .mc-pins-btn').getAttribute('aria-label')`);
  check('dropping on Pin pins the link', pinnedBefore !== pinnedAfter || /Already pinned|Pinned/.test(await toasts()), `${pinnedBefore} → ${pinnedAfter}; ${await toasts()}`);
  await startDrag();
  await dropOn('New space');
  await sleep(300);
  const sheetOpen = await evaluate(`Boolean(document.querySelector('dialog[open] input'))`);
  await evaluate(`document.querySelector('dialog[open] input')?.focus()`);
  await send('Input.insertText', { text: 'Dropped here' });
  await evaluate(`document.querySelector('dialog[open] form')?.requestSubmit()`);
  await sleep(800);
  const madeToast = await toasts();
  check('dropping on + New space makes it and files the card there', sheetOpen && /Dropped here/.test(madeToast), madeToast);

  // 6. Phone width
  await size(390, 844, true);
  await go('/library');
  await scrollTo(1600);
  const phone = await barShown();
  const phoneTop = await evaluate(`getComputedStyle(document.querySelector('.mc-stick-top-name')).display`);
  check('390: the bar fits, ↑ is icon-only', phone?.shown && phone.right <= 390 && phone.height <= 68 && phoneTop === 'none', JSON.stringify({ ...phone, phoneTop }));
  await shot('bar-phone');

  // 7. Dark
  await size(1440, 900);
  await go('/library');
  await evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
  await scrollTo(1400);
  await shot('bar-dark');
} catch (error) {
  check('script ran', false, error.message);
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
const relevantErrors = errors.filter((e) => e && !/favicon|Failed to load resource/.test(e));
if (relevantErrors.length) console.log(`console errors:\n  ${relevantErrors.join('\n  ')}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
ws.close();
chrome.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still closing */ }
process.exit(failed || relevantErrors.length ? 1 : 0);

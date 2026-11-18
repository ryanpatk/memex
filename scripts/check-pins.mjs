#!/usr/bin/env node
/* eslint-env node */
/*
 * Pinned sites check (components/cards/PinnedButton.tsx, PinLauncher.tsx;
 * docs/pinned-sites.md), on the demo data's seven global pins:
 *   - the top bar: the nav pill is only Journal · Cards · Tasks; one gold
 *     pin button sits beside the Inbox, and hovering it moves nothing else
 *   - the launcher: opens from the button with all seven in their order,
 *     inside the window and on top, focus on the first site, Esc closes and
 *     returns focus to the button
 *   - order: Shift+→ on a site and a drag inside the launcher both reorder
 *   - unpin: a pin dragged out of the launcher (Undo puts it back in its
 *     place), and “Edit pins”
 *   - pin: a link card dropped on the gold button; the open card's •••
 *   - ⌥1 opens the first pin, not while typing
 *   - scope: Cards with one space chosen, and a space page, show that
 *     space's pins (the board shows the same); everywhere else the global ones
 *   - 1024 and 390 widths: the button is there and the launcher fits
 *   - no pins: the launcher says how to pin one
 * Prints a table and exits 1 on any failure. SHOTS=<dir> saves screenshots.
 *
 *   VITE_MEMEX_FIXTURES=1 npx vite --port 5391
 *   node scripts/check-pins.mjs http://localhost:5391
 *
 * Demo data only (VITE_MEMEX_FIXTURES); it pins and unpins freely. Never
 * point it at a signed-in production account. CHROME=<path> overrides the browser.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base] = process.argv.slice(2);
if (!base) {
  console.error('Usage: node scripts/check-pins.mjs <base url>');
  process.exit(1);
}
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'memex-pins-'));
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
const KEYCODES = { Escape: 27, ArrowRight: 39, ArrowLeft: 37, Tab: 9, '1': 49 };
const key = async (k, code = k, modifiers = 0) => {
  const vk = KEYCODES[k] ?? 0;
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
const size = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const go = async (path) => { await send('Page.navigate', { url: base + path }); await sleep(2200); };
const shot = async (name) => {
  if (!SHOTS) return;
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, 'base64'));
};

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: String(detail) });

// Page helpers (run inside the app)
const BTN = '.mc-top .mc-pins-btn';
const launcherNames = () => evaluate(`[...document.querySelectorAll('.mc-launcher .mc-launch-site')].map((a) => a.getAttribute('aria-label').replace(' (opens in a new tab)', ''))`);
const visible = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.width > 0; })()`);
const centre = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const openLauncher = async () => { await evaluate(`document.querySelector(${JSON.stringify(BTN)}).click()`); await sleep(450); };
const closeLauncher = async () => { await key('Escape'); await sleep(250); };
const launcherFit = () => evaluate(`(() => {
  const el = document.querySelector('.mc-launcher'); if (!el) return null;
  const r = el.getBoundingClientRect();
  const pts = [...el.querySelectorAll('.mc-launch-site')].map((a) => { const q = a.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }).filter(([, y]) => y > r.top && y < r.bottom);
  const covered = pts.filter(([x, y]) => !el.contains(document.elementFromPoint(x, y))).length;
  return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, covered, points: pts.length };
})()`);
/** A synthetic HTML5 drag from one element to another, or onto the page (React sees real DragEvents with a shared DataTransfer). */
const synthDrag = (fromSel, toSel, { side = 'after', toBody = false } = {}) => evaluate(`(async () => {
  const from = document.querySelector(${JSON.stringify(fromSel)});
  const to = ${toBody ? 'document.querySelector(".mc-page, main") ?? document.body' : `document.querySelector(${JSON.stringify(toSel)})`};
  if (!from || !to) return false;
  const dt = new DataTransfer();
  const fr = from.getBoundingClientRect(); const tr = to.getBoundingClientRect();
  const x = ${toBody ? 'tr.left + 40' : side === 'after' ? 'tr.right - 4' : 'tr.left + 4'}; const y = ${toBody ? 'Math.min(innerHeight - 40, tr.top + 300)' : 'tr.top + tr.height / 2'};
  const fire = (el, type, cx, cy) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
  fire(from, 'dragstart', fr.left + 5, fr.top + 5);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
  fire(to, 'dragenter', x, y); fire(to, 'dragover', x, y);
  await new Promise((r) => setTimeout(r, 60));
  fire(to, 'drop', x, y);
  fire(from, 'dragend', x, y);
  await new Promise((r) => setTimeout(r, 300));
  return true;
})()`);
const toasts = () => evaluate(`[...document.querySelectorAll('.mc-toast')].map((t) => t.textContent).join(' | ')`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

try {
  // 1. The top bar: plain nav pill, one gold button
  await size(1440, 900);
  await go('/library');
  const pill = await evaluate(`[...document.querySelectorAll('.mc-top .mc-seg > *')].map((el) => el.textContent.trim())`);
  check('nav pill is just Journal · Cards · Tasks', JSON.stringify(pill) === JSON.stringify(['Journal', 'Cards', 'Tasks']), pill.join(' · '));
  const btn = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(BTN)}); if (!b) return null; const next = b.parentElement.querySelector('.mc-inbox-btn'); return { label: b.getAttribute('aria-label'), bg: getComputedStyle(b).backgroundColor, beforeInbox: Boolean(next) && (b.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 }; })()`);
  check('one gold pin button, beside the Inbox', btn && btn.beforeInbox && btn.bg === 'rgb(255, 201, 40)' && btn.label === 'Pinned, 7 sites', JSON.stringify(btn));
  check('no pins or +N in the bar', (await evaluate(`document.querySelectorAll('.mc-top a[target="_blank"]').length`)) === 0);
  const barBefore = await evaluate(`JSON.stringify([...document.querySelectorAll('.mc-top .mc-seg, .mc-top .mc-inbox-btn, .mc-top .mc-avatar')].map((e) => e.getBoundingClientRect()))`);
  const c = await centre(BTN);
  await mouse('mouseMoved', c[0], c[1]);
  await sleep(400);
  check('hovering the button moves nothing else', barBefore === (await evaluate(`JSON.stringify([...document.querySelectorAll('.mc-top .mc-seg, .mc-top .mc-inbox-btn, .mc-top .mc-avatar')].map((e) => e.getBoundingClientRect()))`)));
  await shot('bar');
  await mouse('mouseMoved', 700, 600);

  // 2. The launcher
  await openLauncher();
  const names = await launcherNames();
  check('launcher: all seven, hand-placed first', names.length === 7 && names[0].startsWith('Local-first') && names[1].startsWith('Calm Technology'), names.join(' · '));
  const fit = await launcherFit();
  check('launcher: inside the window, on top', fit && fit.inside && fit.covered === 0, JSON.stringify(fit));
  check('launcher: focus on the first site', await evaluate(`document.activeElement === document.querySelector('.mc-launch-site')`));
  check('button holds its open look', (await evaluate(`document.querySelector(${JSON.stringify(BTN)}).getAttribute('aria-expanded')`)) === 'true');
  await shot('launcher');
  await closeLauncher();
  check('Esc closes, focus back on the button', !(await visible('.mc-launcher')) && (await evaluate(`document.activeElement?.classList.contains('mc-pins-btn')`)));

  // 3. Order: Shift+→ on the first site, then a drag
  await openLauncher();
  await key('ArrowRight', 'ArrowRight', 8);
  await sleep(400);
  const moved = await launcherNames();
  check('Shift+→ moves the focused pin', moved[0] === names[1] && moved[1] === names[0], moved.slice(0, 2).join(' · '));
  check('Shift+→ keeps focus on the moved pin', await evaluate(`document.activeElement?.getAttribute('aria-label')?.startsWith(${JSON.stringify(names[0])})`));
  const beforeDrag = await launcherNames();
  await synthDrag('.mc-launch-tile:nth-child(1)', '.mc-launch-tile:nth-child(4)', { side: 'after' });
  const afterDrag = await launcherNames();
  check('drag in the launcher reorders', afterDrag[3] === beforeDrag[0] && afterDrag[0] === beforeDrag[1], afterDrag.slice(0, 4).join(' · '));

  // 4. Unpin by dragging a pin out of the launcher, then Undo
  const order = await launcherNames();
  await synthDrag('.mc-launch-tile:nth-child(2)', null, { toBody: true });
  await sleep(200);
  if (!(await visible('.mc-launcher'))) await openLauncher();
  const afterUnpin = await launcherNames();
  check('dragging a pin out unpins it', afterUnpin.length === 6 && !afterUnpin.includes(order[1]), afterUnpin.join(' · '));
  const t = await toasts();
  check('unpin toast offers Undo', /Unpinned/.test(t) && /Undo/.test(t), t);
  await evaluate(`[...document.querySelectorAll('.mc-toast button')].find((b) => b.textContent.trim() === 'Undo')?.click()`);
  await sleep(500);
  check('Undo puts it back in its place', JSON.stringify(await launcherNames()) === JSON.stringify(order), (await launcherNames()).slice(0, 3).join(' · '));
  await closeLauncher();

  // 5. ⌥1 opens the first pin
  await evaluate(`window.__opened = []; window.open = (url) => { window.__opened.push(url); return null; }; document.activeElement?.blur()`);
  await key('¡', 'Digit1', 1);
  await sleep(200);
  const opened = await evaluate(`window.__opened`);
  check('⌥1 opens the first pin', opened.length === 1, opened.join(' '));
  await evaluate(`document.querySelector('.mc-field input')?.focus()`);
  await key('¡', 'Digit1', 1);
  await sleep(200);
  check('⌥1 does nothing while typing', (await evaluate(`window.__opened.length`)) === 1);
  await evaluate(`document.activeElement?.blur()`);

  // 6. Drop a link card on the gold button
  const dropped = await evaluate(`(async () => {
    const card = [...document.querySelectorAll('[data-item-key^="link:"]')].find((c) => !c.querySelector('.mc-pin'));
    if (!card) return 'no card';
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
    const btn = document.querySelector(${JSON.stringify(BTN)});
    const ready = btn.classList.contains('is-drop-ready');
    const r = btn.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 20 };
    btn.dispatchEvent(new DragEvent('dragenter', opts)); btn.dispatchEvent(new DragEvent('dragover', opts));
    await new Promise((r) => setTimeout(r, 60));
    const over = btn.classList.contains('is-drop-over');
    btn.dispatchEvent(new DragEvent('drop', opts));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 400));
    return (ready ? 'ready ' : '') + (over ? 'over ' : '') + 'ok';
  })()`);
  const label8 = await evaluate(`document.querySelector(${JSON.stringify(BTN)}).getAttribute('aria-label')`);
  check('a card dropped on the button is pinned', dropped === 'ready over ok' && label8 === 'Pinned, 8 sites', `${dropped}; ${label8}; ${await toasts()}`);
  check('the button is back to normal after the drop', !(await evaluate(`document.querySelector(${JSON.stringify(BTN)}).matches('.is-drop-ready, .is-drop-over')`)));

  // 7. The open card's •••
  await go('/library?link=ln-10');
  await evaluate(`document.querySelector('dialog[open] button[aria-label="More actions"]')?.click()`);
  await sleep(300);
  const items = await evaluate(`[...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((b) => b.textContent)`);
  check('open card ••• on a pinned link: “Unpin”', items.includes('Unpin'), items.join(' · '));
  await key('Escape');

  // 8. Scope
  await go('/library?space=sp-kitchen');
  await openLauncher();
  const kitchen = await launcherNames();
  const title = await evaluate(`document.querySelector('.mc-launch-title')?.textContent`);
  check('Cards with one space: that space’s pins', title === 'Pinned in Kitchen reno' && kitchen.length === 2, `${title}: ${kitchen.join(' · ')}`);
  await closeLauncher();
  await go('/spaces/sp-kitchen');
  await openLauncher();
  const spacePage = await launcherNames();
  check('space page: the same pins', JSON.stringify(spacePage) === JSON.stringify(kitchen), spacePage.join(' · '));
  await closeLauncher();
  const board = await evaluate(`[...document.querySelectorAll('.mc-sp-pins a')].map((a) => a.getAttribute('aria-label').replace(' (opens in a new tab)', ''))`);
  check('space board keeps its pins, same order', JSON.stringify(board) === JSON.stringify(spacePage), board.join(' · '));
  await go('/spaces/sp-jobs');
  await openLauncher();
  const empty = await evaluate(`document.querySelector('.mc-launch-empty')?.textContent ?? ''`);
  check('a space with no pins says how to pin one', /Nothing pinned in Job search/.test(empty) && (await launcherNames()).length === 0, empty);
  await shot('empty-space');
  await closeLauncher();
  await go('/tasks');
  await openLauncher();
  check('outside a space: the global pins', (await launcherNames()).length === 7 && (await evaluate(`document.querySelector('.mc-launch-title')?.textContent`)) === 'Pinned');
  await closeLauncher();

  // 9. Narrow and phone widths
  for (const [w, h, mobile, name] of [[1024, 700, false, 'narrow'], [390, 844, true, 'phone']]) {
    await size(w, h, mobile);
    await go('/library');
    const inBar = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(BTN)}); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0; })()`);
    await openLauncher();
    const f = await launcherFit();
    check(`${w}: button in the top bar, launcher fits`, inBar && f?.inside && f.covered === 0, JSON.stringify(f));
    await shot(name);
    await closeLauncher();
  }

  // 10. Dark
  await size(1440, 900);
  await go('/library');
  await evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
  await openLauncher();
  await shot('dark');
  await closeLauncher();
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

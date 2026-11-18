#!/usr/bin/env node
/* eslint-env node */
/*
 * Pinned sites check (components/cards/PinBar.tsx, PinLauncher.tsx;
 * docs/pinned-sites.md), on the demo data's seven global pins:
 *   - the bar: a divider, five pins in their order, “+2”; names on hover
 *   - the launcher: opens from “+2” with all seven, inside the window and on
 *     top, focus on the first site, Esc closes and returns focus
 *   - order: Shift+→ on a pin, a drag inside the launcher, both in the bar
 *   - unpin: dragged off the bar (Undo puts it back in its place), and from
 *     “Edit pins” in the launcher
 *   - pin: a link card dragged onto the bar's slot; the open card's •••
 *   - ⌥1 opens the first pin
 *   - scope: Cards with one space chosen, and a space page, show that
 *     space's pins; everywhere else the global ones
 *   - narrow (1024) and phone (390) widths: one pin button opens the launcher
 *   - hovering a pin doesn't move the pill
 *   - no pins: no divider, nothing extra in the pill
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
const BAR = `document.querySelector('.mc-pinbar')`;
const barNames = () => evaluate(`[...document.querySelectorAll('.mc-pinbar .mc-pinbar-pins .mc-pinbtn')].map((a) => a.getAttribute('aria-label').replace(' (opens in a new tab)', ''))`);
const launcherNames = () => evaluate(`[...document.querySelectorAll('.mc-launcher .mc-launch-site')].map((a) => a.getAttribute('aria-label').replace(' (opens in a new tab)', ''))`);
const visible = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.width > 0; })()`);
const centre = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const launcherFit = () => evaluate(`(() => {
  const el = document.querySelector('.mc-launcher'); if (!el) return null;
  const r = el.getBoundingClientRect();
  const pts = [...el.querySelectorAll('.mc-launch-site')].map((a) => { const q = a.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }).filter(([, y]) => y > r.top && y < r.bottom);
  const covered = pts.filter(([x, y]) => !el.contains(document.elementFromPoint(x, y))).length;
  return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, covered, points: pts.length };
})()`);
/** A synthetic HTML5 drag from one element to another (React sees real DragEvents with a shared DataTransfer). */
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

try {
  // 1. The bar at a wide window
  await size(1440, 900);
  await go('/library');
  const names = await barNames();
  check('bar: five pins', names.length === 5, names.join(' · '));
  check('bar: hand-placed pins first', names[0]?.startsWith('Local-first') && names[1]?.startsWith('Calm Technology'), names.slice(0, 2).join(' · '));
  check('bar: divider', await visible('.mc-pinbar-sep'));
  check('bar: “+2”', (await evaluate(`document.querySelector('.mc-pin-more')?.textContent`)) === '+2');
  check('bar: fold button hidden', !(await visible('.mc-pin-fold')));

  // Hover: the name shows, the pill stays put
  const pillBefore = await evaluate(`JSON.stringify(document.querySelector('.mc-navpill').getBoundingClientRect())`);
  const firstPin = await centre('.mc-pinbar-pins .mc-pinbtn');
  await mouse('mouseMoved', firstPin[0], firstPin[1]);
  await sleep(900);
  const tip = await evaluate(`(() => { const t = document.querySelector('.mc-pinbar-pins .mc-pinbtn .mc-pin-tip'); return { o: getComputedStyle(t).opacity, text: t.textContent }; })()`);
  check('hover: name and ⌥1 show', tip.o === '1' && tip.text.includes('⌥1'), tip.text);
  const pillAfter = await evaluate(`JSON.stringify(document.querySelector('.mc-navpill').getBoundingClientRect())`);
  check('hover: pill doesn’t move', pillBefore === pillAfter);
  await shot('bar-hover');
  await mouse('mouseMoved', 700, 600);

  // 2. The launcher
  await evaluate(`document.querySelector('.mc-pin-more').click()`);
  await sleep(500);
  const all = await launcherNames();
  check('launcher: all seven pins', all.length === 7, all.join(' · '));
  const fit = await launcherFit();
  check('launcher: inside the window, on top', fit && fit.inside && fit.covered === 0, JSON.stringify(fit));
  check('launcher: focus on the first site', await evaluate(`document.activeElement?.classList.contains('mc-launch-site') && document.activeElement === document.querySelector('.mc-launch-site')`));
  await shot('launcher');
  await key('Escape');
  await sleep(300);
  check('launcher: Esc closes, focus back on “+2”', !(await visible('.mc-launcher')) && (await evaluate(`document.activeElement?.classList.contains('mc-pin-more')`)));

  // 3. Order: Shift+→ on the first pin
  await evaluate(`document.querySelector('.mc-pinbar-pins .mc-pinbtn').focus()`);
  await key('ArrowRight', 'ArrowRight', 8);
  await sleep(400);
  const moved = await barNames();
  check('Shift+→ moves the focused pin', moved[0] === names[1] && moved[1] === names[0], moved.slice(0, 2).join(' · '));
  check('Shift+→ keeps focus on the moved pin', await evaluate(`document.activeElement?.getAttribute('aria-label')?.startsWith(${JSON.stringify(names[0])})`));

  // Drag inside the launcher: the first tile after the fourth
  await evaluate(`document.querySelector('.mc-pin-more').click()`);
  await sleep(400);
  const beforeDrag = await launcherNames();
  await synthDrag('.mc-launch-tile:nth-child(1)', '.mc-launch-tile:nth-child(4)', { side: 'after' });
  const afterDrag = await launcherNames();
  check('drag in the launcher reorders', afterDrag[3] === beforeDrag[0] && afterDrag[0] === beforeDrag[1], afterDrag.slice(0, 4).join(' · '));
  check('the bar follows the launcher’s order', JSON.stringify((await barNames())) === JSON.stringify(afterDrag.slice(0, 5)));
  await key('Escape');
  await sleep(200);

  // 4. Unpin by dragging off the bar, then Undo
  const order = await barNames();
  await synthDrag('.mc-pinbar-pins .mc-pinbtn:nth-child(2)', null, { toBody: true });
  const afterUnpin = await barNames();
  check('drag off the bar unpins', !afterUnpin.includes(order[1]) && (await evaluate(`document.querySelector('.mc-pin-more')?.textContent`)) === '+1', afterUnpin.join(' · '));
  const toast = await evaluate(`[...document.querySelectorAll('.mc-toast')].map((t) => t.textContent).join(' | ')`);
  check('unpin toast offers Undo', /Unpinned/.test(toast) && /Undo/.test(toast), toast);
  await evaluate(`[...document.querySelectorAll('.mc-toast button')].find((b) => b.textContent.trim() === 'Undo')?.click()`);
  await sleep(500);
  check('Undo puts it back in its place', JSON.stringify(await barNames()) === JSON.stringify(order), (await barNames()).join(' · '));

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

  // 6. Pin a card by dragging it onto the bar (an unpinned link card)
  const unpinnedCard = await evaluate(`(() => {
    const pinned = new Set([...document.querySelectorAll('.mc-launch-site, .mc-pinbar .mc-pinbtn')].map((a) => a.getAttribute('href')));
    const card = [...document.querySelectorAll('[data-item-key^="link:"]')].find((c) => !c.querySelector('.mc-pin'));
    if (!card) return null; card.setAttribute('data-check-pin', '1'); return card.getAttribute('data-item-key');
  })()`);
  const countBefore = (await barNames()).length + Number((await evaluate(`document.querySelector('.mc-pin-more')?.textContent ?? '+0'`)).slice(1));
  const dropped = await evaluate(`(async () => {
    const card = document.querySelector('[data-check-pin="1"]');
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
    const slot = document.querySelector('.mc-pin-drop');
    if (!slot) return 'no slot';
    const r = slot.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 };
    slot.dispatchEvent(new DragEvent('dragenter', opts)); slot.dispatchEvent(new DragEvent('dragover', opts));
    await new Promise((r) => setTimeout(r, 60));
    slot.dispatchEvent(new DragEvent('drop', opts));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 400));
    return 'ok';
  })()`);
  const countAfter = (await barNames()).length + Number((await evaluate(`document.querySelector('.mc-pin-more')?.textContent ?? '+0'`)).slice(1));
  check('a card dropped on the bar is pinned (at the end)', dropped === 'ok' && countAfter === countBefore + 1, `${unpinnedCard}: ${countBefore} → ${countAfter} (${dropped})`);

  // 7. The open card's ••• says Pin to the bar / Unpin from the bar
  await go('/library?link=ln-10');
  await evaluate(`document.querySelector('dialog[open] button[aria-label="More actions"]')?.click()`);
  await sleep(300);
  const items = await evaluate(`[...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((b) => b.textContent)`);
  check('open card ••• on a pinned link: “Unpin from the bar”', items.some((t) => t.includes('Unpin from the bar')), items.join(' · '));
  await key('Escape');

  // 8. Scope: one space on Cards, a space page
  await go('/library?space=sp-kitchen');
  const kitchen = await barNames();
  const label = await evaluate(`${BAR}?.getAttribute('aria-label') ?? ''`);
  check('Cards with one space: that space’s pins', label.includes('Kitchen') && JSON.stringify(kitchen) !== JSON.stringify(names), `${label}: ${kitchen.join(' · ')}`);
  await go('/spaces/sp-kitchen');
  const spacePage = await barNames();
  check('space page: the same pins as Cards in that space', JSON.stringify(spacePage) === JSON.stringify(kitchen), spacePage.join(' · '));
  const board = await evaluate(`[...document.querySelectorAll('.mc-sp-pins a')].map((a) => a.getAttribute('aria-label').replace(' (opens in a new tab)', ''))`);
  check('space board keeps its pins, same order', JSON.stringify(board) === JSON.stringify(spacePage), board.join(' · '));
  await shot('space');
  await go('/tasks');
  check('outside a space: the global pins', (await barNames()).length === 5 && !(await evaluate(`${BAR}.getAttribute('aria-label')`)).includes(' in '));

  // 9. Narrow window: one pin button
  await size(1024, 700);
  await go('/library');
  check('1024: pins folded into one button', !(await visible('.mc-pinbar-pins')) && (await visible('.mc-pin-fold')));
  await evaluate(`document.querySelector('.mc-pin-fold').click()`);
  await sleep(500);
  const narrowFit = await launcherFit();
  check('1024: the button opens the launcher', (await launcherNames()).length === 7 && narrowFit?.inside && narrowFit.covered === 0, JSON.stringify(narrowFit));
  await shot('narrow');
  await key('Escape');

  // 10. Phone width: the button sits in the tab bar; the launcher opens above it
  await size(390, 844, true);
  await go('/library');
  const tab = await evaluate(`(() => { const b = document.querySelector('.mc-pin-fold'); const bar = document.querySelector('.mc-navpill'); if (!b) return null; const r = b.getBoundingClientRect(); const s = bar.getBoundingClientRect(); return { inBar: r.top >= s.top && r.bottom <= s.bottom, inside: r.right <= innerWidth && r.left >= 0, fixed: getComputedStyle(bar).position }; })()`);
  check('390: pin button in the tab bar', tab?.inBar && tab.inside && tab.fixed === 'fixed', JSON.stringify(tab));
  await evaluate(`document.querySelector('.mc-pin-fold').click()`);
  await sleep(500);
  const phoneFit = await launcherFit();
  check('390: launcher fits the screen', phoneFit?.inside && phoneFit.covered === 0, JSON.stringify(phoneFit));
  await shot('phone');
  await key('Escape');

  // 11. Dark
  await size(1440, 900);
  await go('/library');
  await evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
  await evaluate(`document.querySelector('.mc-pin-more').click()`);
  await sleep(400);
  await shot('dark');
  await key('Escape');

  // 12. No pins: unpin everything from “Edit pins”, then nothing extra shows
  await go('/library');
  await evaluate(`document.querySelector('.mc-pin-more').click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('.mc-launcher button')].find((b) => b.textContent.startsWith('Edit pins'))?.click()`);
  for (let i = 0; i < 10; i++) {
    const x = await evaluate(`(() => { const b = document.querySelector('.mc-launch-x'); if (!b) return false; b.click(); return true; })()`);
    if (!x) break;
    await sleep(250);
  }
  // The last few are in the bar once the launcher closes: unpin them by dragging off
  for (let i = 0; i < 6; i++) {
    if (!(await evaluate(`Boolean(document.querySelector('.mc-pinbar-pins .mc-pinbtn'))`))) break;
    await synthDrag('.mc-pinbar-pins .mc-pinbtn', null, { toBody: true });
  }
  check('no pins: no divider, no pin group', !(await evaluate(`Boolean(document.querySelector('.mc-pinbar'))`)));
  check('no pins: the pill is just the three words', (await evaluate(`document.querySelectorAll('.mc-navpill a, .mc-navpill button').length`)) === 3);
  await shot('empty');
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

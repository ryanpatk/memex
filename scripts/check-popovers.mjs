#!/usr/bin/env node
/* eslint-env node */
/*
 * Popover placement check (components/cards/Popover.tsx): opens every kind
 * of popover and ••• menu at several desktop window sizes, with triggers near
 * each edge, and checks that each one is
 *   - fully inside the window (no part off screen),
 *   - on top: points inside it hit the popover itself, not the grid, the top
 *     bar or a sheet above or below it,
 *   - keyboard-friendly (menus): Esc closes it and focus goes back to the
 *     trigger,
 *   - steady (menus): with a real pointer, hovering the trigger, clicking it
 *     and moving onto the menu leaves both the trigger's and the menu's boxes
 *     exactly where they were (an open trigger keeps its hover look).
 * Prints a table and exits 1 on any failure. Screenshots of the two cases
 * Ryan reported (the open card's ••• menu, the space pills' More) go to
 * SHOTS=<dir> when set.
 *
 *   VITE_MEMEX_FIXTURES=1 npx vite build --mode bench --outDir /tmp/memex-fx
 *   npx vite preview --outDir /tmp/memex-fx --port 4173
 *   node scripts/check-popovers.mjs http://localhost:4173 [label]
 *
 * Demo data only (VITE_MEMEX_FIXTURES): it creates three spaces so the More
 * pill appears, which the in-memory fixture forgets on reload. Never point it
 * at a signed-in production account. CHROME=<path> overrides the browser.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base, label = 'run'] = process.argv.slice(2);
if (!base) {
  console.error('Usage: node scripts/check-popovers.mjs <base url> [label]');
  process.exit(1);
}
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  [1024, 640],
  [1280, 800],
  [1920, 1080],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'memex-popovers-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,800', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
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
const key = async (k, code = k) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 });
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
const go = async (path) => { await send('Page.navigate', { url: base + path }); await sleep(2200); };
const shot = async (name) => {
  if (!SHOTS) return;
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${label}-${name}.png`), Buffer.from(result.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

// Measures the open popover `sel`: inside the window, and on top at its centre and at each item
const MEASURE = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { found: false };
  const r = el.getBoundingClientRect(); const vw = innerWidth, vh = innerHeight;
  const cs = getComputedStyle(el);
  const pts = [[r.left + r.width / 2, r.top + Math.min(r.height / 2, 40)]];
  // Each item's centre, for the items showing inside the popover's own box (a long one scrolls)
  el.querySelectorAll('[role^="menuitem"], [role="option"], button, a').forEach((b) => { const q = b.getBoundingClientRect(); const y = q.top + q.height / 2; if (q.height && pts.length < 9 && y > r.top + 4 && y < r.bottom - 4) pts.push([q.left + q.width / 2, y]); });
  const covered = pts.filter(([x, y]) => { if (x < 0 || y < 0 || x > vw || y > vh) return true; const hit = document.elementFromPoint(x, y); return !hit || !el.contains(hit); }).length;
  return { found: true, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
    inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
    covered, points: pts.length, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], vw, vh,
    scrolls: el.scrollHeight > el.clientHeight + 1 };
})()`;
const CLICK = (sel) => `(() => { const el = typeof ${JSON.stringify(sel)} === 'string' ? document.querySelector(${JSON.stringify(sel)}) : null; if (!el) return false; el.click(); return true; })()`;

/** Adds spaces through the New space sheet until the pill row folds some into More. */
const ensureMoreSpaces = async () => {
  for (let i = 0; i < 6; i++) {
    const hasMore = await evaluate(`[...document.querySelectorAll('.mc-pills button')].some((b) => b.textContent.trim() === 'More')`);
    if (hasMore) return true;
    if (!(await evaluate(CLICK('button[aria-label="New space"]')))) return false;
    await sleep(400);
    await evaluate(`document.querySelector('dialog[open] input')?.focus()`);
    await send('Input.insertText', { text: `Extra space ${i + 1}` });
    await evaluate(`(() => { const f = document.querySelector('dialog[open] form'); f?.requestSubmit(); })()`);
    await sleep(700);
    // Creating a space opens its page; back to Cards in the app (a reload would forget the demo spaces)
    await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="/library"]')?.click()`);
    await sleep(700);
  }
  return evaluate(`[...document.querySelectorAll('.mc-pills button')].some((b) => b.textContent.trim() === 'More')`);
};

const CASES = [
  {
    name: 'card-actions', note: 'open card sheet ••• (bottom edge, inside a modal sheet)', path: '/library?link=ln-1', shot: true,
    open: `document.querySelector('dialog[open] button[aria-label="More actions"]')?.click()`,
    trigger: 'dialog[open] button[aria-label="More actions"]', popover: '[role="menu"][aria-label="Card actions"]', menu: true,
  },
  {
    name: 'more-spaces', note: 'space pills → More (inside the scrolling pill row, over the grid)', path: '/library', shot: true, setup: ensureMoreSpaces,
    // Scrolled into view in the pill row first, as you would before clicking it
    open: `(() => { const b = [...document.querySelectorAll('.mc-pills button')].find((x) => x.textContent.trim() === 'More'); b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); b.click(); })()`,
    trigger: null, popover: '[role="menu"][aria-label="More spaces"]', menu: true,
  },
  {
    name: 'account', note: 'account menu (top-right corner)', path: '/library',
    open: `document.querySelector('.mc-avatar')?.click()`, trigger: '.mc-avatar', popover: '[role="menu"][aria-label="Account"]', menu: true,
  },
  {
    name: 'view-panel', note: 'Cards ••• View panel (right edge)', path: '/library',
    open: `document.querySelector('button[aria-label="View options"]')?.click()`, trigger: 'button[aria-label="View options"]', popover: '.mc-view-panel',
  },
  {
    name: 'task-bottom', note: 'last task row ••• scrolled to the bottom edge', path: '/tasks',
    open: `(() => { const rows = document.querySelectorAll('[data-task-id]'); const row = rows[rows.length - 1]; row.scrollIntoView({ block: 'end' }); document.querySelector('.mc-shell-main').scrollTop += 0; const b = row.querySelector('button[aria-haspopup="menu"]'); window.__trigger = b; b.click(); })()`,
    trigger: '__window', popover: '[role="menu"]:not([hidden])', menu: true,
  },
  {
    name: 'space-menu', note: 'space page band ••• (top-right)', path: '/spaces/sp-kitchen',
    open: `document.querySelector('button[aria-label="Kitchen reno options"]')?.click()`, trigger: 'button[aria-label="Kitchen reno options"]', popover: '[role="menu"][aria-label="Kitchen reno options"]', menu: true,
  },
  {
    name: 'jot-actions', note: 'Journal jot ··· (bottom of the feed, by the composer)', path: '/',
    open: `(() => { const bs = document.querySelectorAll('button[aria-label="Jot actions"]'); const b = bs[bs.length - 1]; b.scrollIntoView({ block: 'end' }); window.__trigger = b; b.click(); })()`,
    trigger: '__window', popover: '[role="menu"][aria-label="Jot actions"]', menu: true,
  },
  {
    name: 'journal-picker', note: 'Journal composer “@” space picker (bottom edge)', path: '/', typeInto: '.jr-composer-input',
    open: '', trigger: null, popover: '[role="listbox"][aria-label="Spaces"]',
  },
  {
    name: 'task-picker', note: 'Tasks add field “@” space picker', path: '/tasks', typeInto: '.mc-task-composer input',
    open: '', trigger: null, popover: '[role="listbox"][aria-label="Spaces"]',
  },
];

const rows = [];
let failures = 0;
for (const [w, h] of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  for (const c of CASES) {
    await go(c.path);
    if (c.setup && !(await c.setup())) { rows.push({ viewport: `${w}×${h}`, case: c.name, result: 'SETUP FAILED' }); failures++; continue; }
    if (c.typeInto) {
      await evaluate(`document.querySelector(${JSON.stringify(c.typeInto)}).focus()`);
      await send('Input.insertText', { text: '@' });
    } else await evaluate(`(() => { ${c.open}; })()`);
    await sleep(500);
    const m = await evaluate(MEASURE(c.popover));
    if (c.shot && (w === 1280 || w === 1024)) await shot(`${c.name}-${w}x${h}`);
    // Scroll the page under it: it should follow its trigger or close, never float off on its own
    let afterScroll = null;
    if (m.found && c.name === 'more-spaces') {
      await evaluate(`document.querySelector('.mc-shell-main').scrollBy(0, 120)`);
      await sleep(300);
      afterScroll = await evaluate(`(() => { const p = document.querySelector(${JSON.stringify(c.popover)}); const t = [...document.querySelectorAll('.mc-pills button')].find((b) => b.textContent.trim() === 'More'); if (!p) return 'closed'; const pr = p.getBoundingClientRect(), tr = t.getBoundingClientRect(); return Math.abs(pr.top - tr.bottom) < 40 || Math.abs(tr.top - pr.bottom) < 40 ? 'follows' : 'detached'; })()`);
      await evaluate(`document.querySelector('.mc-shell-main').scrollBy(0, -120)`);
      await sleep(200);
    }
    const TRIGGER = c.trigger === '__window' ? 'window.__trigger' : c.trigger ? `document.querySelector(${JSON.stringify(c.trigger)})` : `[...document.querySelectorAll('.mc-pills button')].find((b) => b.textContent.trim() === 'More')`;
    let escape = null;
    if (c.menu && m.found) {
      await key('Escape');
      await sleep(250);
      escape = await evaluate(`(() => { const open = document.querySelector(${JSON.stringify(c.popover)}); const t = ${TRIGGER}; return { closed: !open || getComputedStyle(open).display === 'none', focusBack: document.activeElement === t }; })()`);
    }
    // Real pointer: hover the trigger, click, then move onto the menu's first item
    let shift = null;
    if (c.menu && m.found) {
      // With motion on: the hover lift is a transform, which reduced motion turns off
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      const box = (expr) => `(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100); })()`;
      const t0 = await evaluate(box(TRIGGER));
      const [tx, ty] = [t0[0] + t0[2] / 2, t0[1] + t0[3] / 2];
      await mouse('mouseMoved', tx, ty);
      await sleep(350);
      await mouse('mousePressed', tx, ty, { button: 'left', clickCount: 1 });
      await mouse('mouseReleased', tx, ty, { button: 'left', clickCount: 1 });
      await sleep(450);
      const tA = await evaluate(box(TRIGGER));
      const pA = await evaluate(box(`document.querySelector(${JSON.stringify(c.popover)})`));
      const item = await evaluate(box(`document.querySelector(${JSON.stringify(c.popover)})?.querySelector('[role^="menuitem"], button')`));
      if (pA && item) {
        const [ix, iy] = [item[0] + item[2] / 2, item[1] + item[3] / 2];
        for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', tx + ((ix - tx) * i) / 6, ty + ((iy - ty) * i) / 6); await sleep(16); }
        await sleep(450);
        const tB = await evaluate(box(TRIGGER));
        const pB = await evaluate(box(`document.querySelector(${JSON.stringify(c.popover)})`));
        shift = pB ? Math.round(100 * Math.max(...tA.map((v, i) => Math.abs(v - tB[i])), ...pA.map((v, i) => Math.abs(v - pB[i])))) / 100 : 'closed';
      } else shift = 'not opened';
      await key('Escape');
      await mouse('mouseMoved', 1, 1);
      await sleep(200);
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    const ok = m.found && m.visible && m.inside && m.covered === 0 && (!escape || (escape.closed && escape.focusBack)) && afterScroll !== 'detached' && (shift === null || shift === 0);
    if (!ok) failures++;
    rows.push({
      viewport: `${w}×${h}`, case: c.name, result: ok ? 'ok' : 'FAIL',
      inside: m.found ? m.inside : 'not found', covered: m.found ? `${m.covered}/${m.points}` : '', rect: m.rect?.join(','), scrolls: m.scrolls,
      esc: escape ? `${escape.closed ? 'closes' : 'stays'}${escape.focusBack ? ', focus back' : ', focus lost'}` : '', scroll: afterScroll ?? '',
      'moved px': shift ?? '',
    });
  }
}
console.log(`popover check: ${label}`);
console.table(rows);
if (errors.length) console.log('console errors:', [...new Set(errors)]);
console.log(failures ? `${failures} failing` : 'all ok');
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);

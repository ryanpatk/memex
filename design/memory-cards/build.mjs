// Render every Memory Cards mockup to html/<id>.html and png/<id>.png.
// Run via ./make.sh [ids...]  (e.g. ./make.sh d01 m01). Needs Node 22+ and a Chrome/Chromium.
// Env: CHROME_PATH (browser binary), PLAYWRIGHT_CORE (module path; default "playwright-core",
// install with `npm i --no-save playwright-core` or `npx -y playwright-core`).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MC_CSS, ITEMS } from './mc.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromeDefaults = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const executablePath = process.env.CHROME_PATH || chromeDefaults.find((p) => fs.existsSync(p));
// Fonts come from the repo's own node_modules (@fontsource-variable/inter, @fontsource/nunito).
// IBM Plex Sans (the .plex switch) is vendored in fonts/ (SIL OFL, see fonts/LICENSE-IBM-Plex.txt).
const nm = '../../../node_modules'; // relative to html/
const nunito = [400, 700, 800, 900].map((w) => `@font-face{font-family:"Nunito";src:url("${nm}/@fontsource/nunito/files/nunito-latin-${w}-normal.woff2") format("woff2");font-weight:${w}}`).join('');
const plex = [400, 500, 600, 700].map((w) => `@font-face{font-family:"IBM Plex Sans";src:url("../fonts/ibm-plex-sans-latin-${w}-normal.woff2") format("woff2");font-weight:${w}}`).join('');
const fontcss = `@font-face{font-family:"Inter";src:url("${nm}/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2") format("woff2");font-weight:100 900}${nunito}${plex}`;
const only = process.argv.slice(2);
const b = await chromium.launch(executablePath ? { executablePath } : {});
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
fs.mkdirSync(path.join(here, 'html'), { recursive: true });
fs.mkdirSync(path.join(here, 'png'), { recursive: true });
for (const it of ITEMS) {
  if (only.length && !only.includes(it.id)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${it.id} ${it.l}</title><style>${fontcss}${MC_CSS}body{margin:0}</style></head><body><div class="mc ${it.cls || ''}">${it.html}</div></body></html>`;
  const f = path.join(here, 'html', `${it.id}.html`);
  fs.writeFileSync(f, html);
  await p.goto('file://' + f);
  await p.evaluate(async () => { await Promise.all(['Nunito','Inter','IBM Plex Sans'].flatMap((f) => ['400','700','900'].map((w) => document.fonts.load(`${w} 20px "${f}"`)))); await document.fonts.ready; });
  await p.waitForTimeout(100);
  await p.locator('.frame').first().screenshot({ path: path.join(here, 'png', `${it.id}.png`) });
}
console.log(`rendered ${only.length || ITEMS.length} of ${ITEMS.length} items`);
await b.close();

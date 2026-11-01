#!/usr/bin/env node
/**
 * Checks a memex vault (docs/vault-format.md) without printing any content:
 *   - vault.json and .memex/manifest.json exist and are a memex vault
 *   - every Markdown file's frontmatter parses as YAML and has the fields its type needs
 *   - every wikilink and embed ([[…]], ![[…]]) in bodies and frontmatter resolves to a file
 *   - every file the manifest lists exists with the recorded sha256; every downloaded image exists
 *   - per-type file counts match the manifest's counts (and the database's, when recorded)
 *   - every Journal jot round-trips: frontmatter refs ⇄ ^jot- list items, no duplicate ids
 *
 *   node scripts/check-vault.mjs [vault]        # default ~/memex-vault
 *
 * Prints a summary; exits 1 on any problem. YAML is parsed with js-yaml when it's
 * installed (an independent parser, from the repo's node_modules); installed copies
 * without node_modules fall back to JSON-per-value parsing of the exporter's strict
 * subset.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { parseJournalBody, splitFrontmatter } = await import(pathToFileURL(path.join(here, 'export-vault.mjs')).href);

let yamlLoad = null;
let parserName = 'built-in strict subset';
try {
  const mod = await import('js-yaml');
  yamlLoad = (text) => (mod.load ?? mod.default.load)(text, { schema: (mod.JSON_SCHEMA ?? mod.default.JSON_SCHEMA) });
  parserName = 'js-yaml';
} catch {
  yamlLoad = strictSubsetLoad;
}

/** Parser for exactly what export-vault.mjs emits: scalars are JSON, lists are `- `. */
function strictSubsetLoad(text) {
  const lines = text.split('\n').filter((l) => l.length);
  let i = 0;
  const indentOf = (l) => l.length - l.trimStart().length;
  const scalar = (raw) => JSON.parse(raw);
  function block(indent) {
    const obj = {};
    while (i < lines.length && indentOf(lines[i]) === indent && !lines[i].trimStart().startsWith('- ')) {
      const m = /^(\s*)([A-Za-z][\w]*):(?: (.*))?$/.exec(lines[i]);
      if (!m) throw new Error(`unparseable line ${i + 1}`);
      i++;
      if (m[3] !== undefined) {
        obj[m[2]] = m[3] === '[]' ? [] : scalar(m[3]);
      } else if (i < lines.length && lines[i].trimStart().startsWith('- ')) {
        obj[m[2]] = list(indentOf(lines[i]));
      } else {
        obj[m[2]] = block(indentOf(lines[i]));
      }
    }
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (i < lines.length && indentOf(lines[i]) === indent && lines[i].trimStart().startsWith('- ')) {
      const rest = lines[i].trimStart().slice(2);
      if (/^[A-Za-z]\w*:( |$)/.test(rest)) {
        lines[i] = `${' '.repeat(indent + 2)}${rest}`;
        arr.push(block(indent + 2));
      } else {
        arr.push(scalar(rest));
        i++;
      }
    }
    return arr;
  }
  const result = block(0);
  if (i !== lines.length) throw new Error(`unparseable line ${i + 1}`);
  return result;
}

const vault = path.resolve((process.argv[2] ?? path.join(os.homedir(), 'memex-vault')).replace(/^~(?=$|\/)/, os.homedir()));
const problems = [];
const problem = (msg) => problems.push(msg);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function walk(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // .memex, .obsidian, .DS_Store
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), r));
    else out.push(r);
  }
  return out;
}

if (!fs.existsSync(path.join(vault, 'vault.json'))) {
  console.error(`CHECK FAILED: ${vault} has no vault.json`);
  process.exit(1);
}
const vaultJson = JSON.parse(fs.readFileSync(path.join(vault, 'vault.json'), 'utf8'));
if (vaultJson.format !== 'memex-vault' || vaultJson.schema !== 1) problem('vault.json: not a schema-1 memex vault');
const manifest = JSON.parse(fs.readFileSync(path.join(vault, '.memex', 'manifest.json'), 'utf8'));

const files = walk(vault);
const fileSet = new Set(files);
const REQUIRED = {
  link: ['schema', 'type', 'id', 'url', 'source', 'capturedBy', 'created', 'updated', 'spaces', 'tags'],
  note: ['schema', 'type', 'id', 'created', 'updated', 'spaces', 'tags'],
  task: ['schema', 'type', 'id', 'title', 'done', 'created', 'updated', 'spaces', 'tags'],
  'journal-day': ['schema', 'type', 'date', 'timezone', 'jots'],
  space: ['schema', 'type', 'id', 'name', 'created', 'updated'],
};
const counts = { links: 0, notes: 0, tasks: 0, jots: 0, spaces: 0, journalDays: 0 };
const seenIds = new Map();
let links = 0;
let embeds = 0;

const resolveLink = (target) => {
  const t = target.split('#')[0].split('^')[0];
  return fileSet.has(t) || fileSet.has(`${t}.md`);
};

function checkLinks(text, where) {
  for (const m of text.matchAll(/(!?)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    if (m[1]) embeds++;
    else links++;
    if (!resolveLink(m[2])) problem(`${where}: unresolved ${m[1] ? 'embed' : 'link'} → ${m[2]}`);
  }
}

for (const rel of files.filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(path.join(vault, rel), 'utf8');
  if (rel === 'README.md') {
    checkLinks(text, rel);
    continue;
  }
  const { yaml, body } = splitFrontmatter(text);
  if (yaml === null) {
    if (manifest.files[rel]) problem(`${rel}: no frontmatter`);
    continue;
  }
  let fm;
  try {
    fm = yamlLoad(yaml);
  } catch (error) {
    problem(`${rel}: frontmatter doesn't parse (${String(error.message).split('\n')[0]})`);
    continue;
  }
  if (!fm || typeof fm !== 'object') {
    problem(`${rel}: empty frontmatter`);
    continue;
  }
  for (const key of REQUIRED[fm.type] ?? []) if (!(key in fm)) problem(`${rel}: missing ${key}`);
  if (fm.schema !== 1) problem(`${rel}: schema isn't 1`);
  checkLinks(body, rel);
  checkLinks(JSON.stringify(fm).replace(/\\"/g, ''), `${rel} (frontmatter)`);
  for (const key of ['image', 'favicon']) if (fm[key] && !fileSet.has(fm[key])) problem(`${rel}: ${key} file missing`);
  if (fm.id) {
    if (seenIds.has(fm.id)) problem(`${rel}: duplicate id (also ${seenIds.get(fm.id)})`);
    seenIds.set(fm.id, rel);
  }
  if (manifest.files[rel] && manifest.files[rel].id !== (fm.type === 'journal-day' ? fm.date : fm.id)) problem(`${rel}: id differs from manifest`);

  switch (fm.type) {
    case 'link': counts.links++; break;
    case 'note': counts.notes++; break;
    case 'task': counts.tasks++; break;
    case 'space': counts.spaces++; break;
    case 'journal-day': {
      counts.journalDays++;
      const parsed = parseJournalBody(body);
      const refs = new Set();
      for (const jot of fm.jots ?? []) {
        counts.jots++;
        const key = String(jot.ref ?? '').replace(/^jot-/, '');
        refs.add(key);
        if (seenIds.has(jot.id)) problem(`${rel}: duplicate jot id`);
        seenIds.set(jot.id, rel);
        if (!parsed.has(key) && typeof jot.text !== 'string') problem(`${rel}: jot ${jot.ref} has no list item`);
      }
      for (const key of parsed.keys()) if (!refs.has(key)) problem(`${rel}: list item ^jot-${key} has no frontmatter entry`);
      break;
    }
    default: problem(`${rel}: unknown type ${fm.type}`);
  }
}

for (const [rel, entry] of Object.entries(manifest.files ?? {})) {
  const abs = path.join(vault, rel);
  if (!fs.existsSync(abs)) problem(`manifest lists missing file ${rel}`);
  else if (sha256(fs.readFileSync(abs, 'utf8')) !== entry.sha256) problem(`${rel}: changed since export (sha256)`);
}
const assets = manifest.assets ?? [];
for (const asset of assets.filter((a) => a.status === 'ok')) {
  const abs = path.join(vault, asset.file);
  if (!fs.existsSync(abs)) problem(`image missing: ${asset.file}`);
  else if (fs.statSync(abs).size !== asset.bytes) problem(`image size differs: ${asset.file}`);
}

for (const key of Object.keys(counts)) {
  if (manifest.counts?.[key] !== counts[key]) problem(`count ${key}: files ${counts[key]}, manifest ${manifest.counts?.[key]}`);
}
if (manifest.databaseCounts) {
  for (const [key, value] of Object.entries(manifest.databaseCounts)) {
    const have = key in counts ? counts[key] : manifest.counts?.[key];
    if (Number(value) !== have) problem(`count ${key}: database ${value}, vault ${have}`);
  }
}

const imageCounts = { ok: 0, failed: 0, skipped: 0 };
for (const a of assets) imageCounts[a.status] = (imageCounts[a.status] ?? 0) + 1;
console.log(`vault ${vault} (exported ${manifest.exportedAt}, YAML via ${parserName})`);
console.log(`  ${counts.links} links · ${counts.notes} notes · ${counts.tasks} tasks · ${counts.jots} jots in ${counts.journalDays} days · ${counts.spaces} spaces`);
if (manifest.databaseCounts) console.log(`  database: ${Object.entries(manifest.databaseCounts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  ${links} wikilinks + ${embeds} embeds checked · images ${imageCounts.ok} ok, ${imageCounts.failed} failed, ${imageCounts.skipped} skipped`);
if (problems.length) {
  console.error(`CHECK FAILED: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('check ok');

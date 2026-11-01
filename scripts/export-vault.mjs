#!/usr/bin/env node
/**
 * Walk-away export: writes every memex item, jot, space and tag into a vault
 * folder of Markdown + YAML frontmatter (format: docs/vault-format.md), and
 * downloads the images links point at into assets/.
 *
 *   node scripts/export-vault.mjs                    # → ~/memex-vault
 *   node scripts/export-vault.mjs --out /Volumes/Backup/memex-vault
 *   node scripts/export-vault.mjs --dry-run          # read + render, write nothing
 *   node scripts/export-vault.mjs --no-images        # skip downloads (keeps earlier ones)
 *   node scripts/export-vault.mjs --from-json data.json --out dir   # fake data (fixtures)
 *
 * Reads production through the Supabase CLI (`npx -y supabase@2 db query
 * --linked`), the same sanctioned login as scripts/backup-supabase.sh: the CLI
 * uses its own access token (from `npx supabase@2 login`) and a temporary login
 * role, so no keys or passwords are needed here. Every query runs inside
 * `begin transaction read only`, so Postgres rejects any write.
 *
 * Safe to re-run: unchanged files aren't touched, images already downloaded are
 * kept, files for items deleted in memex are removed (only files this exporter
 * wrote, as listed in .memex/manifest.json). Image failures are recorded in the
 * manifest; they never abort the run. Real data is never written inside the repo.
 *
 * Exit codes: 0 ok · 1 export failed · 2 bad arguments.
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 1;
const FORMAT = 'memex-vault';
const FORMAT_DOC = 'https://github.com/ryanpatk/memex/blob/main/docs/vault-format.md';
const DEFAULT_PROJECT_REF = 'zwgotlojioprtjvrxltc'; // memex (production)
const IMAGE_TIMEOUT_MS = 20_000;
const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_CONCURRENCY = 8;
const QUERY_TIMEOUT_MS = 5 * 60_000;

// Space identity colours, in the app's order (src/utils/spaceColor.ts assigns
// them by creation order from the hued canvas swatches' `source` colours).
// Read from src/constants/canvasColors.ts when it's there; this copy is the
// fallback for installed copies of the script.
const FALLBACK_SPACE_COLORS = [
  'oklch(0.62 0.21 268)', 'oklch(0.77 0.15 229)', 'oklch(0.71 0.24 143)', 'oklch(0.89 0.18 95)',
  'oklch(0.79 0.17 68)', 'oklch(0.69 0.20 17)', 'oklch(0.72 0.16 298)', 'oklch(0.80 0.14 347)',
];

const MANAGED_DIRS = ['links', 'notes', 'tasks', 'journal', 'spaces', 'settings', 'legacy', 'assets'];

// ───────────────────────────── arguments ─────────────────────────────

function parseArgs(argv) {
  const opts = {
    out: process.env.MEMEX_VAULT_DIR || path.join(os.homedir(), 'memex-vault'),
    projectRef: process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF,
    cli: process.env.SUPABASE_CLI || 'npx -y supabase@2',
    timeZone: process.env.MEMEX_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    images: true,
    dryRun: false,
    fromJson: null,
    now: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--out': opts.out = value(); break;
      case '--project-ref': opts.projectRef = value(); break;
      case '--tz': opts.timeZone = value(); break;
      case '--from-json': opts.fromJson = path.resolve(value()); break;
      case '--now': opts.now = value(); break;
      case '--no-images': opts.images = false; break;
      case '--dry-run': opts.dryRun = true; break;
      case '-h': case '--help': usage(); break;
      default: usage(`Unknown argument: ${arg}`);
    }
  }
  opts.out = path.resolve(opts.out.replace(/^~(?=$|\/)/, os.homedir()));
  return opts;
}

function usage(error) {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 12).join('\n');
  if (error) console.error(`${error}\n`);
  console.error(text.replace(/^ \* ?/gm, ''));
  process.exit(error ? 2 : 0);
}

// ───────────────────────────── small helpers ─────────────────────────────

const log = (...args) => console.log(...args);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const compact = (id) => String(id).replace(/-/g, '').toLowerCase();

/** Lowercase ASCII slug for filenames: “Kitchen layout — options!” → kitchen-layout-options */
export function slugify(text, max = 60) {
  const slug = String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/** Obsidian tag: letters, digits, _ - /; no spaces; not all digits. */
function tagSlug(name) {
  let slug = String(name)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_/-]+/gu, '')
    .replace(/^[-/]+|[-/]+$/g, '');
  if (!slug) slug = 'tag';
  if (/^\d+$/.test(slug)) slug = `tag-${slug}`;
  return slug;
}

/** Text safe as a wikilink alias: no |, [ ], or newlines. */
const alias = (text) =>
  String(text ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '-').replace(/\[/g, '(').replace(/\]/g, ')').trim() || 'untitled';

const wikilink = (relPath, label) => `[[${relPath.replace(/\.md$/, '')}|${alias(label)}]]`;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Platform a link came from (mirrors sourceOf in packages/core/src/sources.ts). */
export function platformOf(link) {
  const host = hostOf(link.url);
  // links.source is the platform since 2026-11-01 ('x', 'pinterest', 'youtube', 'web'),
  // or an older '<platform>:<list>' tag.
  const platform = (link.source ?? '').split(':')[0];
  if (platform === 'pinterest' || /(^|\.)pinterest\.|^pin\.it$/.test(host)) return 'pinterest';
  if (platform === 'x' || /^(x|twitter)\.com$/.test(host)) return 'x';
  if (platform === 'youtube' || /(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'youtube';
  return 'web';
}

/**
 * How it arrived and which of your lists on the source held it: the
 * captured_by / lists columns when set (2026-11-01 on), else read from the
 * older links.source tag (mirrors parseSourceTag in packages/core/src/capture/input.ts).
 */
function captureOf(link) {
  const sourceTag = link.source ?? null;
  const fromTag = { capturedBy: sourceTag ? 'extension' : 'app', lists: [] };
  if (sourceTag === 'x:bookmark') fromTag.lists.push('bookmarked');
  if (sourceTag === 'pinterest:save') fromTag.lists.push('saved');
  if (/:like$/.test(sourceTag ?? '')) fromTag.lists.push('liked');
  return {
    capturedBy: link.captured_by ?? fromTag.capturedBy,
    lists: Array.isArray(link.lists) && link.lists.length ? link.lists : fromTag.lists,
  };
}

// ───────────────────────────── YAML (a small, strict emitter) ─────────────────────────────
// Strings are always double-quoted (JSON string syntax is valid YAML), so no
// value is ever reinterpreted as a date, number or boolean by a reader.

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function yamlLines(obj, indent = '') {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${indent}${key}: []`);
        continue;
      }
      lines.push(`${indent}${key}:`);
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const inner = yamlLines(item, `${indent}    `);
          lines.push(`${indent}  - ${inner[0].trimStart()}`, ...inner.slice(1));
        } else {
          lines.push(`${indent}  - ${yamlScalar(item)}`);
        }
      }
    } else if (value && typeof value === 'object') {
      lines.push(`${indent}${key}:`, ...yamlLines(value, `${indent}  `));
    } else {
      lines.push(`${indent}${key}: ${yamlScalar(value)}`);
    }
  }
  return lines;
}

const frontmatter = (obj) => `---\n${yamlLines(obj).join('\n')}\n---\n`;

// ───────────────────────────── reading production ─────────────────────────────

const QUERY = `
begin transaction read only;
select json_build_object(
  'links',         (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.links t),
  'notes',         (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.notes t),
  'tasks',         (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.tasks t),
  'jots',          (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.self_messages t),
  'spaces',        (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.profiles t),
  'tags',          (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.tags t),
  'projects',      (select coalesce(json_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id), '[]') from public.projects t),
  'link_tags',     (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.link_tags t),
  'note_tags',     (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.note_tags t),
  'task_tags',     (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.task_tags t),
  'profile_links', (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profile_links t),
  'profile_notes', (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profile_notes t),
  'profile_tasks', (select coalesce(json_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profile_tasks t),
  'counts', json_build_object(
    'links', (select count(*) from public.links),
    'notes', (select count(*) from public.notes),
    'tasks', (select count(*) from public.tasks),
    'jots', (select count(*) from public.self_messages),
    'spaces', (select count(*) from public.profiles),
    'tags', (select count(*) from public.tags),
    'legacyProjects', (select count(*) from public.projects)
  )
) as data;
commit;
`;

function run(cmd, args, { timeoutMs, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${cmd} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.slice(0, 4).join(' ')}… exited ${code}\n${stderr.trim()}`));
    });
  });
}

async function readProduction(opts) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'memex-export-'));
  const sqlFile = path.join(tmp, 'export.sql');
  try {
    await fsp.writeFile(sqlFile, QUERY);
    const [cmd, ...cliArgs] = opts.cli.split(/\s+/).filter(Boolean);
    const args = [...cliArgs, 'db', 'query', '--agent', 'no', '--linked', '--project-ref', opts.projectRef, '-o', 'json', '-f', sqlFile];
    const { stdout } = await run(cmd, args, { timeoutMs: QUERY_TIMEOUT_MS, cwd: tmp });
    const start = stdout.indexOf('[');
    if (start < 0) throw new Error('The Supabase CLI returned no JSON rows');
    const rows = JSON.parse(stdout.slice(start));
    const data = rows?.[0]?.data;
    if (!data || !Array.isArray(data.links)) throw new Error('Unexpected query result shape');
    return data;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

// ───────────────────────────── model ─────────────────────────────

function loadSpaceColors(repoRoot) {
  const candidates = repoRoot
    ? ['src/constants/canvasColors.ts', 'packages/core/src/constants/canvasColors.ts'].map((p) => path.join(repoRoot, p))
    : [];
  for (const file of candidates) {
    try {
      const colors = [...fs.readFileSync(file, 'utf8').matchAll(/^\s*source:\s*'([^']+)'/gm)].map((m) => m[1]);
      if (colors.length) return colors;
    } catch {
      /* try the next one */
    }
  }
  return FALLBACK_SPACE_COLORS;
}

/** Shortest unique compact-id prefix (8, then 12, then all 32 hex chars) for every id. */
function shortKeys(ids) {
  const keys = new Map();
  for (const len of [8, 12, 32]) {
    const pending = ids.filter((id) => !keys.has(id));
    const counts = new Map();
    for (const id of pending) counts.set(compact(id).slice(0, len), (counts.get(compact(id).slice(0, len)) ?? 0) + 1);
    for (const id of pending) {
      const key = compact(id).slice(0, len);
      if (counts.get(key) === 1 || len === 32) keys.set(id, key);
    }
  }
  return keys;
}

function dayParts(iso, timeZone) {
  const date = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, year: parts.year };
}

function longDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function buildModel(data, opts, spaceColors) {
  const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
  for (const key of ['links', 'notes', 'tasks', 'jots', 'spaces', 'tags', 'projects']) data[key] = [...(data[key] ?? [])].sort(byCreated);
  for (const key of ['link_tags', 'note_tags', 'task_tags', 'profile_links', 'profile_notes', 'profile_tasks']) data[key] = [...(data[key] ?? [])].sort(byCreated);

  const keys = shortKeys([...data.links, ...data.notes, ...data.tasks, ...data.jots].map((r) => r.id));

  // Tags → unique Obsidian slugs
  const tags = new Map();
  const usedTagSlugs = new Set();
  for (const tag of data.tags) {
    let slug = tagSlug(tag.name);
    for (let n = 2; usedTagSlugs.has(slug); n++) slug = `${tagSlug(tag.name)}-${n}`;
    usedTagSlugs.add(slug);
    tags.set(tag.id, { ...tag, slug });
  }

  // Spaces → unique file names + identity colours (creation order, as the app does)
  const spaces = new Map();
  const usedSpaceSlugs = new Set();
  data.spaces.forEach((space, index) => {
    const base = slugify(space.name) || `space-${compact(space.id).slice(0, 8)}`;
    let slug = base;
    for (let n = 2; usedSpaceSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSpaceSlugs.add(slug);
    spaces.set(space.id, {
      ...space,
      slug,
      path: `spaces/${slug}.md`,
      boardPath: `spaces/${slug}.board.json`,
      color: spaceColors[index % spaceColors.length],
      members: [],
    });
  });

  const items = new Map(); // id → item
  const addItem = (type, row, titleText) => {
    const key = keys.get(row.id);
    const stem = `${slugify(titleText) || 'untitled'}-${key}`;
    const item = { type, row, key, title: titleText, path: `${type}s/${stem}.md`, tags: [], spaces: [], pinnedIn: [] };
    items.set(row.id, item);
    return item;
  };
  for (const link of data.links) addItem('link', link, link.title?.trim() || hostOf(link.url) || link.url);
  for (const note of data.notes) addItem('note', note, note.title?.trim() || firstLine(note.body) || 'Untitled note');
  for (const task of data.tasks) addItem('task', task, task.title?.trim() || 'Untitled task');

  for (const [joins, field] of [[data.link_tags, 'link_id'], [data.note_tags, 'note_id'], [data.task_tags, 'task_id']]) {
    for (const join of joins) {
      const item = items.get(join[field]);
      const tag = tags.get(join.tag_id);
      if (item && tag && !item.tags.includes(tag.slug)) item.tags.push(tag.slug);
    }
  }
  for (const [joins, field, type] of [[data.profile_links, 'link_id', 'link'], [data.profile_notes, 'note_id', 'note'], [data.profile_tasks, 'task_id', 'task']]) {
    for (const join of joins) {
      const item = items.get(join[field]);
      const space = spaces.get(join.profile_id);
      if (!item || !space) continue;
      if (!item.spaces.includes(space)) item.spaces.push(space);
      if (join.is_super_favorite) item.pinnedIn.push(space);
      space.members.push({
        type,
        id: item.row.id,
        order: join.order_index ?? 0,
        pinned: join.is_super_favorite === true ? true : undefined,
        added: join.created_at,
        item,
      });
    }
  }

  // Journal days: jots plus a pointer line for every item created that day
  const days = new Map();
  const dayOf = (day, year) => {
    if (!days.has(day)) days.set(day, { day, year, path: `journal/${year}/${day}.md`, jots: [], entries: [] });
    return days.get(day);
  };
  for (const jot of data.jots) {
    const { day, time, year } = dayParts(jot.created_at, opts.timeZone);
    const entry = { kind: 'jot', at: jot.created_at, time, jot, key: keys.get(jot.id), space: jot.profile_id ? spaces.get(jot.profile_id) : null };
    const d = dayOf(day, year);
    d.jots.push(entry);
    d.entries.push(entry);
  }
  for (const item of items.values()) {
    const { day, time, year } = dayParts(item.row.created_at, opts.timeZone);
    dayOf(day, year).entries.push({ kind: 'item', at: item.row.created_at, time, item });
  }
  for (const d of days.values()) d.entries.sort((a, b) => String(a.at).localeCompare(String(b.at)) || (a.kind === 'jot' ? -1 : 1));

  const projects = new Map(data.projects.map((p) => [p.id, p]));
  return { data, items, spaces, tags, days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), projects };
}

function firstLine(text) {
  return String(text ?? '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
}

// ───────────────────────────── journal day format (render + parse) ─────────────────────────────
// A jot is a top-level list item that ends in a ^jot-<key> block id:
//   - **09:12** one-line jot text ^jot-3f9a1c2b
//   - **09:15** · [[spaces/home-reno|Home reno]] ^jot-4a0b9c1d     ← multi-line or filed jot:
//     body lines, each indented two spaces                         the body follows, indented
// Every other line (headings, navigation, "saved link …" pointers) is derived and ignored by readers.

const JOT_HEADER = /^- \*\*(\d\d:\d\d)\*\*(?: · \[\[[^\]]*\]\])? \^jot-([0-9a-f]{8,32})$/;
const JOT_INLINE = /^- \*\*(\d\d:\d\d)\*\* (.*) \^jot-([0-9a-f]{8,32})$/;

export function renderJot(entry) {
  const body = entry.jot.body ?? '';
  const spacePart = entry.space ? ` · ${wikilink(entry.space.path, entry.space.name)}` : '';
  if (!entry.space && body && !body.includes('\n') && !body.includes('\r')) {
    return `- **${entry.time}** ${body} ^jot-${entry.key}`;
  }
  const lines = [`- **${entry.time}**${spacePart} ^jot-${entry.key}`];
  if (body) for (const line of body.split('\n')) lines.push(line === '' ? '' : `  ${line}`);
  return lines.join('\n');
}

/** Parse a journal day file's body back into { key → text }. Exported for tests and the v2 importer. */
export function parseJournalBody(body) {
  const jots = new Map();
  let current = null;
  const close = () => {
    if (!current) return;
    while (current.lines.length && current.lines[current.lines.length - 1] === '') current.lines.pop();
    jots.set(current.key, current.lines.join('\n'));
    current = null;
  };
  for (const line of body.split('\n')) {
    if (current && (line === '' || line.startsWith('  '))) {
      current.lines.push(line === '' ? '' : line.slice(2));
      continue;
    }
    close();
    let m = JOT_HEADER.exec(line);
    if (m) {
      current = { key: m[2], lines: [] };
      continue;
    }
    m = JOT_INLINE.exec(line);
    if (m) jots.set(m[3], m[2]);
  }
  close();
  return jots;
}

/** Split a vault file into its frontmatter text and body. */
export function splitFrontmatter(text) {
  if (!text.startsWith('---\n')) return { yaml: null, body: text };
  const end = text.indexOf('\n---\n', 3);
  if (end < 0) return { yaml: null, body: text };
  return { yaml: text.slice(4, end + 1), body: text.slice(end + 5) };
}

// ───────────────────────────── rendering ─────────────────────────────

const GEN_START = '<!-- memex:generated (rewritten on every export) -->';
const GEN_END = '<!-- /memex:generated -->';

function itemTypeLabel(item) {
  return { link: 'saved link', note: 'wrote note', task: 'added task' }[item.type];
}

function renderLink(item, model, assets) {
  const link = item.row;
  const { capturedBy, lists } = captureOf(link);
  const preview = assets.get(`${link.id}:preview`);
  const favicon = assets.get(`${link.id}:favicon`);
  const fm = {
    schema: SCHEMA,
    type: 'link',
    id: link.id,
    title: link.title ?? null,
    url: link.url,
    source: platformOf(link),
    sourceId: link.source_id ?? undefined,
    capturedBy,
    capturedClient: link.captured_client ?? undefined,
    lists,
    sourceTag: link.source ?? undefined,
    created: link.created_at,
    updated: link.updated_at,
    spaces: item.spaces.map((s) => wikilink(s.path, s.name)),
    pinnedIn: item.pinnedIn.length ? item.pinnedIn.map((s) => wikilink(s.path, s.name)) : undefined,
    tags: item.tags,
    superFavorite: link.is_super_favorite === true ? true : undefined,
    order: link.order_index ?? 0,
    description: link.description ?? undefined,
    image: preview?.status === 'ok' ? preview.file : undefined,
    imageUrl: link.preview_image_url ?? undefined,
    favicon: favicon?.status === 'ok' ? favicon.file : undefined,
    faviconUrl: link.favicon_url ?? undefined,
    legacyProjectId: link.project_id ?? undefined,
  };
  const body = [GEN_START, `# ${alias(item.title)}`, ''];
  if (preview?.status === 'ok') body.push(`![[${preview.file}]]`, '');
  if (link.description) body.push(link.description.replace(/\r/g, ''), '');
  body.push(`[${alias(hostOf(link.url) || 'Open link')}](${link.url.replace(/[()\s]/g, encodeURIComponent)})`, GEN_END, '');
  return frontmatter(fm) + body.join('\n');
}

function renderNote(item) {
  const note = item.row;
  const fm = {
    schema: SCHEMA,
    type: 'note',
    id: note.id,
    title: note.title ?? null,
    created: note.created_at,
    updated: note.updated_at,
    spaces: item.spaces.map((s) => wikilink(s.path, s.name)),
    tags: item.tags,
    order: note.order_index ?? 0,
  };
  return frontmatter(fm) + (note.body ?? '');
}

function renderTask(item) {
  const task = item.row;
  const fm = {
    schema: SCHEMA,
    type: 'task',
    id: task.id,
    title: task.title,
    done: task.is_done === true,
    due: task.due_date ?? null,
    created: task.created_at,
    updated: task.updated_at,
    spaces: item.spaces.map((s) => wikilink(s.path, s.name)),
    tags: item.tags,
    order: task.order_index ?? 0,
  };
  return frontmatter(fm) + (task.detail ?? '');
}

function renderDay(day, prev, next, timeZone) {
  const jotFm = day.jots.map((entry) => {
    const meta = {
      ref: `jot-${entry.key}`,
      id: entry.jot.id,
      created: entry.jot.created_at,
      updated: entry.jot.updated_at,
      space: entry.space ? wikilink(entry.space.path, entry.space.name) : null,
      legacyId: entry.jot.legacy_id ?? undefined,
    };
    // Bodies a list item can't hold exactly (CR, leading/trailing blank lines or
    // spaces) also travel verbatim in the frontmatter.
    const roundTrip = parseJournalBody(renderJot(entry)).get(entry.key) ?? '';
    if (roundTrip !== (entry.jot.body ?? '')) meta.text = entry.jot.body ?? '';
    return meta;
  });
  const fm = { schema: SCHEMA, type: 'journal-day', date: day.day, timezone: timeZone, jots: jotFm };
  const nav = [prev ? wikilink(prev.path, `← ${prev.day}`) : null, next ? wikilink(next.path, `${next.day} →`) : null].filter(Boolean).join(' · ');
  const lines = [`# ${longDate(day.day)}`, ''];
  if (nav) lines.push(nav, '');
  for (const entry of day.entries) {
    if (entry.kind === 'jot') lines.push(renderJot(entry), '');
    else lines.push(`- **${entry.time}** ${itemTypeLabel(entry.item)} ${wikilink(entry.item.path, entry.item.title)}`, '');
  }
  return frontmatter(fm) + lines.join('\n');
}

function renderSpace(space) {
  const fm = {
    schema: SCHEMA,
    type: 'space',
    id: space.id,
    name: space.name,
    color: space.color,
    created: space.created_at,
    updated: space.updated_at,
    board: path.basename(space.boardPath),
  };
  const byOrder = (a, b) => a.order - b.order || String(a.added).localeCompare(String(b.added));
  const lines = [GEN_START, `# ${alias(space.name)}`, ''];
  for (const [type, heading] of [['link', 'Links'], ['note', 'Notes'], ['task', 'Tasks']]) {
    const members = space.members.filter((m) => m.type === type).sort(byOrder);
    if (!members.length) continue;
    lines.push(`## ${heading} (${members.length})`, '');
    for (const m of members) {
      const mark = type === 'task' ? (m.item.row.is_done ? '✓ ' : '○ ') : '';
      lines.push(`- ${mark}${wikilink(m.item.path, m.item.title)}${m.pinned ? ' · pinned' : ''}`);
    }
    lines.push('');
  }
  if (!space.members.length) lines.push('_Nothing filed here yet._', '');
  lines.push(GEN_END, '');
  return frontmatter(fm) + lines.join('\n');
}

function renderBoard(space) {
  const typeOrder = { link: 0, note: 1, task: 2 };
  const items = [...space.members]
    .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.order - b.order || String(a.added).localeCompare(String(b.added)))
    .map(({ type, id, order, pinned, added }) => ({ type, id, order, ...(pinned ? { pinned } : {}), added }));
  return `${JSON.stringify({ schema: SCHEMA, type: 'space-board', space: space.id, items }, null, 2)}\n`;
}

function renderTags(model) {
  const tags = [...model.tags.values()].map((t) => ({ id: t.id, name: t.name, slug: t.slug, color: t.color, created: t.created_at, updated: t.updated_at }));
  return `${JSON.stringify({ schema: SCHEMA, type: 'tags', tags }, null, 2)}\n`;
}

function renderProjects(model) {
  const projects = [...model.projects.values()].map((p) => ({
    id: p.id, name: p.name, description: p.description ?? null, starred: p.is_starred === true,
    created: p.created_at, updated: p.updated_at, lastModified: p.last_modified,
  }));
  return `${JSON.stringify({ schema: SCHEMA, type: 'legacy-projects', note: 'Pre-spaces grouping from the original PRD; every link still points at one (legacyProjectId). Superseded by spaces.', projects }, null, 2)}\n`;
}

function renderReadme(model, counts, exportedAt) {
  const spaces = [...model.spaces.values()];
  const recentDays = model.days.slice(-7).reverse();
  const lines = [
    '# memex vault',
    '',
    `Everything in memex as plain files: ${counts.links} links, ${counts.notes} notes, ${counts.tasks} tasks, ${counts.jots} jots across ${counts.journalDays} Journal days, ${counts.spaces} spaces and ${counts.tags} tags. Images links pointed at are in \`assets/\`.`,
    '',
    `Last export: ${exportedAt}. This folder is rewritten by \`scripts/export-vault.mjs\`; files it manages are overwritten, so keep your own notes in other folders. Format: ${FORMAT_DOC}`,
    '',
    '## Spaces',
    '',
    ...(spaces.length ? spaces.map((s) => `- ${wikilink(s.path, s.name)}`) : ['_None yet._']),
    '',
    '## Recent Journal days',
    '',
    ...(recentDays.length ? recentDays.map((d) => `- ${wikilink(d.path, longDate(d.day))}`) : ['_None yet._']),
    '',
    '## Folders',
    '',
    '- `journal/YYYY/YYYY-MM-DD.md`: one daily note per day with jots and what was saved',
    '- `links/`, `notes/`, `tasks/`: one file per item',
    '- `spaces/`: one index note per space, plus its `.board.json` (membership and order)',
    '- `settings/tags.json`, `legacy/projects.json`: structured data',
    '- `assets/<item key>/`: downloaded preview images and favicons',
    '- `.memex/manifest.json`: machine-readable list of every file, count and image download',
    '',
  ];
  return lines.join('\n');
}

// ───────────────────────────── images ─────────────────────────────

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/heic': 'heic',
};

function sniffType(buf) {
  const b = buf.subarray(0, 16);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 4, 12) === 'ftypavif') return 'image/avif';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (/^\s*(<\?xml[^>]*>\s*)?<svg/i.test(buf.subarray(0, 512).toString('utf8'))) return 'image/svg+xml';
  return null;
}

async function fetchImage(url, opts) {
  if (url.startsWith('fixture:')) {
    // Fake-data fixtures only: images resolved next to the --from-json file.
    if (!opts.fromJson) throw new Error('fixture: URLs only work with --from-json');
    const file = path.join(path.dirname(opts.fromJson), url.slice('fixture:'.length));
    const buf = await fsp.readFile(file).catch(() => {
      throw new Error('not found');
    });
    const type = sniffType(buf);
    if (!type) throw new Error('not an image');
    return { buf, type };
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('unsupported URL scheme');
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
          accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
        },
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new Error(`HTTP ${res.status}`);
        if (retryable && attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw lastError;
      }
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > IMAGE_MAX_BYTES) throw new Error(`too large (${declared} bytes)`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > IMAGE_MAX_BYTES) throw new Error(`too large (${buf.length} bytes)`);
      if (buf.length === 0) throw new Error('empty response');
      const headerType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const type = EXT_BY_TYPE[headerType] ? headerType : sniffType(buf);
      if (!type) throw new Error(`not an image (${headerType || 'no content-type'})`);
      return { buf, type };
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const transient = error?.name === 'TimeoutError' || /fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(message);
      if (!(transient && attempt === 0)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (lastError?.name === 'TimeoutError') throw new Error(`timed out after ${IMAGE_TIMEOUT_MS / 1000}s`);
  const cause = lastError?.cause?.code || lastError?.cause?.message;
  throw new Error(cause ? `${lastError.message} (${cause})` : String(lastError?.message ?? lastError));
}

async function pool(jobs, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await worker(job);
    }
  });
  await Promise.all(runners);
}

/** Download (or reuse) every image; returns Map("<itemId>:<role>" → asset record). */
async function syncImages(model, vault, prevAssets, opts, stats) {
  const prevByKey = new Map((prevAssets ?? []).map((a) => [`${a.item}:${a.role}`, a]));
  const jobs = [];
  for (const item of model.items.values()) {
    if (item.type !== 'link') continue;
    for (const [role, url] of [['preview', item.row.preview_image_url], ['favicon', item.row.favicon_url]]) {
      if (url) jobs.push({ item, role, url: String(url).trim() });
    }
  }
  const results = new Map();
  let done = 0;
  await pool(jobs, IMAGE_CONCURRENCY, async (job) => {
    const id = `${job.item.row.id}:${job.role}`;
    const prev = prevByKey.get(id);
    const base = { item: job.item.row.id, role: job.role, url: job.url };
    // Reuse an earlier download of the same URL (moving it if the item's key changed).
    if (prev && prev.url === job.url && prev.status === 'ok' && prev.file && fs.existsSync(path.join(vault, prev.file))) {
      const wanted = `assets/${job.item.key}/${job.role}.${path.extname(prev.file).slice(1)}`;
      if (wanted !== prev.file && !opts.dryRun) {
        await fsp.mkdir(path.dirname(path.join(vault, wanted)), { recursive: true });
        await fsp.rename(path.join(vault, prev.file), path.join(vault, wanted));
      }
      results.set(id, { ...prev, file: wanted });
      stats.imagesKept++;
      return;
    }
    if (!opts.images || opts.dryRun) {
      results.set(id, { ...base, status: 'skipped', error: opts.dryRun ? 'dry run' : 'images disabled' });
      stats.imagesSkipped++;
      return;
    }
    try {
      const { buf, type } = await fetchImage(job.url, opts);
      const file = `assets/${job.item.key}/${job.role}.${EXT_BY_TYPE[type]}`;
      await writeAtomic(path.join(vault, file), buf);
      results.set(id, { ...base, status: 'ok', file, bytes: buf.length, contentType: type, sha256: sha256(buf), fetched: opts.nowIso });
      stats.imagesDownloaded++;
    } catch (error) {
      results.set(id, { ...base, status: 'failed', error: String(error?.message ?? error).slice(0, 300), attempted: opts.nowIso });
      stats.imagesFailed++;
    }
    done++;
    if (done % 100 === 0) log(`  … ${done} images fetched`);
  });
  return results;
}

// ───────────────────────────── file system ─────────────────────────────

async function writeAtomic(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, file);
}

function insideOf(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Real path of the nearest existing ancestor + the rest, so symlinks can't dodge the repo check. */
function realish(p) {
  let current = p;
  const rest = [];
  while (!fs.existsSync(current)) {
    rest.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(fs.realpathSync(current), ...rest);
}

function findRepoRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, 'package.json'))) return fs.realpathSync(dir);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function guardOutput(opts, repoRoot) {
  const out = realish(opts.out);
  const home = fs.realpathSync(os.homedir());
  if (out === '/' || out === home) throw new Error(`Refusing to use ${out} itself as the vault; pick a folder`);
  // Real data never goes inside a checkout. --from-json (fake fixture data) may.
  const guarded = [repoRoot, process.env.MEMEX_REPO_GUARD].filter(Boolean).map((p) => realish(p));
  if (!opts.fromJson) {
    for (const repo of guarded) {
      if (insideOf(out, repo)) throw new Error(`Refusing to write real data inside the repo (${out})`);
    }
    // …nor inside any other git checkout, where it could be committed by accident.
    for (let dir = out; ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, '.git'))) throw new Error(`Refusing to write real data inside a git checkout (${dir})`);
      if (path.dirname(dir) === dir) break;
    }
  }
  // Never adopt a non-empty folder that isn't already a memex vault.
  if (fs.existsSync(out)) {
    const entries = fs.readdirSync(out).filter((e) => e !== '.DS_Store');
    if (entries.length && !fs.existsSync(path.join(out, 'vault.json'))) {
      throw new Error(`${out} isn't empty and has no vault.json; refusing to write into it`);
    }
    if (entries.length) {
      const vault = JSON.parse(fs.readFileSync(path.join(out, 'vault.json'), 'utf8'));
      if (vault.format !== FORMAT) throw new Error(`${out}/vault.json isn't a memex vault`);
    }
  }
  return out;
}

async function acquireLock(vault) {
  const lock = path.join(vault, '.memex', 'export.lock');
  await fsp.mkdir(path.dirname(lock), { recursive: true });
  try {
    await fsp.writeFile(lock, String(process.pid), { flag: 'wx' });
  } catch {
    const pid = Number(await fsp.readFile(lock, 'utf8').catch(() => '0'));
    let alive = false;
    try {
      if (pid) process.kill(pid, 0);
      alive = Boolean(pid);
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`Another export (pid ${pid}) is running on ${vault}`);
    await fsp.writeFile(lock, String(process.pid));
  }
  return () => fsp.rm(lock, { force: true });
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  opts.nowIso = opts.now ?? new Date().toISOString();
  const repoRoot = findRepoRoot();
  const vault = guardOutput(opts, repoRoot);

  log(`memex export → ${vault}${opts.dryRun ? ' (dry run)' : ''}`);
  log(opts.fromJson ? `  reading fake data from ${path.relative(process.cwd(), opts.fromJson)}` : `  reading project ${opts.projectRef} (read-only transaction)…`);
  const data = opts.fromJson ? JSON.parse(await fsp.readFile(opts.fromJson, 'utf8')) : await readProduction(opts);

  const model = buildModel(data, opts, loadSpaceColors(repoRoot));
  const counts = {
    links: data.links.length,
    notes: data.notes.length,
    tasks: data.tasks.length,
    jots: data.jots.length,
    spaces: data.spaces.length,
    tags: data.tags.length,
    legacyProjects: data.projects.length,
    journalDays: model.days.length,
  };
  const dbCounts = data.counts ?? null;
  if (dbCounts) {
    for (const [key, value] of Object.entries(dbCounts)) {
      if (Number(value) !== counts[key]) throw new Error(`Count mismatch for ${key}: database ${value}, export ${counts[key]}`);
    }
  }

  if (!opts.dryRun) await fsp.mkdir(vault, { recursive: true, mode: 0o700 });
  const release = opts.dryRun ? async () => {} : await acquireLock(vault);
  try {
    const manifestPath = path.join(vault, '.memex', 'manifest.json');
    const prev = fs.existsSync(manifestPath) ? JSON.parse(await fsp.readFile(manifestPath, 'utf8')) : null;
    const vaultJsonPath = path.join(vault, 'vault.json');
    const prevVault = fs.existsSync(vaultJsonPath) ? JSON.parse(await fsp.readFile(vaultJsonPath, 'utf8')) : null;

    const stats = { written: 0, unchanged: 0, removed: 0, imagesDownloaded: 0, imagesKept: 0, imagesFailed: 0, imagesSkipped: 0 };
    log(`  ${counts.links} links · ${counts.notes} notes · ${counts.tasks} tasks · ${counts.jots} jots · ${counts.spaces} spaces · ${counts.tags} tags`);
    if (opts.images && !opts.dryRun) log('  syncing images…');
    const assets = await syncImages(model, vault, prev?.assets, opts, stats);

    // Render every managed file.
    const files = new Map(); // relPath → { content, type, id }
    for (const item of model.items.values()) {
      const content = item.type === 'link' ? renderLink(item, model, assets) : item.type === 'note' ? renderNote(item) : renderTask(item);
      files.set(item.path, { content, type: item.type, id: item.row.id });
    }
    model.days.forEach((day, i) => {
      const content = renderDay(day, model.days[i - 1], model.days[i + 1], opts.timeZone);
      // Every jot must read back exactly from the finished file (list item, or its `text` override).
      const parsed = parseJournalBody(splitFrontmatter(content).body);
      const overrides = new Set(day.jots.filter((e) => content.includes(`ref: "jot-${e.key}"\n`) && parsed.get(e.key) !== (e.jot.body ?? '')).map((e) => e.key));
      for (const entry of day.jots) {
        const readBack = parsed.get(entry.key);
        if (readBack !== (entry.jot.body ?? '') && !(overrides.has(entry.key) && content.includes(`text: ${JSON.stringify(entry.jot.body ?? '')}`))) {
          throw new Error(`Journal ${day.day}: jot ${entry.jot.id} doesn't round-trip`);
        }
      }
      files.set(day.path, { content, type: 'journal-day', id: day.day });
    });
    for (const space of model.spaces.values()) {
      files.set(space.path, { content: renderSpace(space), type: 'space', id: space.id });
      files.set(space.boardPath, { content: renderBoard(space), type: 'space-board', id: space.id });
    }
    files.set('settings/tags.json', { content: renderTags(model), type: 'tags', id: null });
    files.set('legacy/projects.json', { content: renderProjects(model), type: 'legacy-projects', id: null });
    files.set('README.md', { content: renderReadme(model, counts, opts.nowIso), type: 'readme', id: null });

    // Write what changed.
    for (const [rel, file] of files) {
      const abs = path.join(vault, rel);
      const existing = fs.existsSync(abs) ? await fsp.readFile(abs, 'utf8') : null;
      if (existing === file.content) {
        stats.unchanged++;
        continue;
      }
      stats.written++;
      if (!opts.dryRun) await writeAtomic(abs, file.content);
    }

    // Remove files an earlier export wrote that no longer exist in memex.
    const keepAssets = new Set([...assets.values()].filter((a) => a.status === 'ok').map((a) => a.file));
    const stale = [
      ...Object.keys(prev?.files ?? {}).filter((rel) => !files.has(rel)),
      ...(prev?.assets ?? []).filter((a) => a.status === 'ok' && a.file && !keepAssets.has(a.file)).map((a) => a.file),
    ];
    for (const rel of stale) {
      const abs = path.join(vault, rel);
      const top = rel.split('/')[0];
      if (!MANAGED_DIRS.includes(top) || !insideOf(abs, vault) || rel.includes('..')) continue;
      if (!fs.existsSync(abs)) continue;
      stats.removed++;
      if (!opts.dryRun) {
        await fsp.rm(abs, { force: true });
        // Tidy now-empty folders up to the managed root.
        let dir = path.dirname(abs);
        while (insideOf(dir, vault) && dir !== vault && MANAGED_DIRS.includes(path.relative(vault, dir).split('/')[0])) {
          if (fs.readdirSync(dir).length) break;
          await fsp.rmdir(dir);
          dir = path.dirname(dir);
        }
      }
    }

    const assetList = [...assets.values()].sort((a, b) => `${a.item}:${a.role}`.localeCompare(`${b.item}:${b.role}`));
    const imageSummary = {
      total: assetList.length,
      ok: assetList.filter((a) => a.status === 'ok').length,
      failed: assetList.filter((a) => a.status === 'failed').length,
      skipped: assetList.filter((a) => a.status === 'skipped').length,
    };
    const manifest = {
      schema: SCHEMA,
      type: 'manifest',
      format: FORMAT,
      generator: 'scripts/export-vault.mjs',
      exportedAt: opts.nowIso,
      source: opts.fromJson ? { kind: 'fixture' } : { kind: 'supabase', projectRef: opts.projectRef },
      timezone: opts.timeZone,
      counts,
      databaseCounts: dbCounts,
      images: imageSummary,
      files: Object.fromEntries(
        [...files.entries()]
          .filter(([rel]) => rel !== 'README.md')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([rel, f]) => [rel, { type: f.type, id: f.id, sha256: sha256(f.content) }]),
      ),
      assets: assetList,
    };
    const vaultJson = {
      schema: SCHEMA,
      format: FORMAT,
      id: prevVault?.id ?? (opts.fromJson ? '00000000-0000-4000-8000-000000000000' : randomUUID()),
      created: prevVault?.created ?? opts.nowIso,
      timezone: opts.timeZone,
      spec: FORMAT_DOC,
    };
    if (!opts.dryRun) {
      await writeAtomic(vaultJsonPath, `${JSON.stringify(vaultJson, null, 2)}\n`);
      await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    log(`  files: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.removed} removed`);
    log(`  images: ${imageSummary.ok} ok (${stats.imagesDownloaded} new, ${stats.imagesKept} kept), ${imageSummary.failed} failed, ${imageSummary.skipped} skipped`);
    log(`done in ${secs}s${opts.dryRun ? ' (dry run: nothing written)' : ''}`);
  } finally {
    await release();
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`EXPORT FAILED: ${error?.message ?? error}`);
    process.exit(1);
  });
}

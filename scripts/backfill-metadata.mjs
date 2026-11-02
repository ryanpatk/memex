/**
 * Backfill metadata for older links: find links missing a title, description
 * or preview image and fetch them through memex-scraper. Only fills gaps; a
 * bare-domain title counts as a gap, a real title is never overwritten.
 *
 * DRY RUN BY DEFAULT: it reads links and calls the scraper, prints what it
 * would change and writes a report, but writes nothing to the database.
 * Writing needs --apply, and per CLAUDE.md (Safety rules) Ryan's go-ahead plus
 * a fresh backup (scripts/backup-supabase.sh) first.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SCRAPER_URL=… \
 *     node scripts/backfill-metadata.mjs [--apply] [--limit N] [--report path]
 *       [--since <ISO date>] [--via-api]
 *   --since    only links created at or after that time
 *   --via-api  only links saved through memex-api (source or captured_by set);
 *              with --since 2026-11-01 this is the set the 1042 scraper bug
 *              left unscraped (fixed 2026-11-02, memex-api bc7e29f2)
 *   (VITE_SUPABASE_URL / VITE_SCRAPER_URL are accepted too, so
 *    `node --env-file=.env --env-file=.env.production --env-file=<key file> …` works.)
 *
 * Skipped on purpose: X / Twitter posts (the scraper only sees X's login wall;
 * the extension reads those from the page instead).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SCRAPER_URL = (process.env.SCRAPER_URL || process.env.VITE_SCRAPER_URL)?.replace(/\/$/, '')
const APPLY = flag('--apply')
const SINCE = option('--since')
const VIA_API = flag('--via-api')
const LIMIT = Number(option('--limit') ?? Infinity)
const CONCURRENCY = 4
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const REPORT = option('--report') ?? path.join(homedir(), 'memex-backups', `backfill-metadata-${stamp}${APPLY ? '' : '-dry-run'}.json`)

if (!SUPABASE_URL || !SERVICE_KEY || !SCRAPER_URL) {
  console.error('Missing env: need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SCRAPER_URL (or their VITE_ forms)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const hostnameOf = (url) => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const isBareTitle = (title, url) => {
  if (!title?.trim()) return true
  const host = hostnameOf(url)
  const normalized = title.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return !normalized || normalized === host || normalized === `www.${host}` ||
    normalized === url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

const isX = (url) => /^(x|twitter|mobile\.twitter)\.com$/.test(hostnameOf(url) ?? '')
const httpUrl = (value) => (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : null)

const scrape = async (url) => {
  const res = await fetch(`${SCRAPER_URL}/api/scrape?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json()
  if (!body.success) throw new Error(body.error || `HTTP ${res.status}`)
  return body.data ?? {}
}

/** The gaps scraped data can fill, field by field. */
const patchFor = (link, scraped) => {
  const patch = {}
  const title = scraped.title?.trim()
  if (title && isBareTitle(link.title, link.url) && !isBareTitle(title, link.url)) patch.title = title
  if (scraped.description?.trim() && !link.description?.trim()) patch.description = scraped.description.trim()
  if (httpUrl(scraped.logo) && !link.favicon_url) patch.favicon_url = httpUrl(scraped.logo)
  if (httpUrl(scraped.image) && !link.preview_image_url) patch.preview_image_url = httpUrl(scraped.image)
  return patch
}

const COLUMNS = 'id, url, title, description, favicon_url, preview_image_url'
const links = []
for (let from = 0; ; from += 1000) {
  let query = supabase.from('links').select(COLUMNS).order('created_at')
  if (SINCE) query = query.gte('created_at', new Date(SINCE).toISOString())
  if (VIA_API) query = query.or('source.not.is.null,captured_by.not.is.null')
  const { data, error } = await query.range(from, from + 999)
  if (error) throw error
  links.push(...data)
  if (data.length < 1000) break
}

// With --via-api, a missing favicon counts as a gap too (the 1042 bug dropped those as well).
const missing = (l) => ({
  favicon: VIA_API && !l.favicon_url,
  title: isBareTitle(l.title, l.url),
  description: !l.description?.trim(),
  image: !l.preview_image_url,
})
const gaps = links.filter((l) => Object.values(missing(l)).some(Boolean))
const skippedX = gaps.filter((l) => isX(l.url))
const candidates = gaps.filter((l) => !isX(l.url)).slice(0, LIMIT)

console.log(`${links.length} links; ${gaps.length} missing a title, description${VIA_API ? ", image or favicon" : " or image"} ` +
  `(${skippedX.length} X posts skipped); checking ${candidates.length}${APPLY ? '' : ' (dry run: nothing is written)'}`)

const results = []
let next = 0
const worker = async () => {
  while (next < candidates.length) {
    const link = candidates[next++]
    try {
      const patch = patchFor(link, await scrape(link.url))
      if (Object.keys(patch).length && APPLY) {
        // Re-read just before writing so an edit made meanwhile is never overwritten.
        const { data: current, error: readError } = await supabase.from('links').select(COLUMNS).eq('id', link.id).single()
        if (readError) throw readError
        const fresh = patchFor(current, { title: patch.title, description: patch.description, logo: patch.favicon_url, image: patch.preview_image_url })
        if (Object.keys(fresh).length) {
          const { error: updateError } = await supabase.from('links').update(fresh).eq('id', link.id)
          if (updateError) throw updateError
        }
        results.push({ id: link.id, url: link.url, outcome: 'updated', fields: Object.keys(fresh) })
      } else {
        results.push({ id: link.id, url: link.url, outcome: Object.keys(patch).length ? 'would-update' : 'nothing-new', fields: Object.keys(patch), patch })
      }
    } catch (err) {
      results.push({ id: link.id, url: link.url, outcome: 'failed', error: String(err.message ?? err) })
    }
    if (results.length % 25 === 0) console.log(`  … ${results.length}/${candidates.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const count = (outcome) => results.filter((r) => r.outcome === outcome).length
const fieldCounts = {}
for (const r of results) for (const f of r.fields ?? []) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1
const missingCounts = { title: 0, description: 0, image: 0, favicon: 0 }
for (const l of gaps) for (const [k, v] of Object.entries(missing(l))) if (v) missingCounts[k] += 1

const summary = {
  mode: APPLY ? 'apply' : 'dry-run',
  scope: { since: SINCE ?? null, viaApi: VIA_API },
  at: new Date().toISOString(),
  links: links.length,
  missing: { any: gaps.length, ...missingCounts },
  skippedX: skippedX.length,
  checked: candidates.length,
  [APPLY ? 'updated' : 'wouldUpdate']: count(APPLY ? 'updated' : 'would-update'),
  nothingNew: count('nothing-new'),
  failed: count('failed'),
  fields: fieldCounts,
}
mkdirSync(path.dirname(REPORT), { recursive: true, mode: 0o700 })
writeFileSync(REPORT, JSON.stringify({ summary, results }, null, 2), { mode: 0o600 })
console.log(JSON.stringify(summary, null, 2))
console.log(`Report (per-link detail, private): ${REPORT}`)

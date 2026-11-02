#!/usr/bin/env node
/**
 * Agent tokens for memex's hosted MCP server (memex-api /mcp, docs/mcp.md).
 *
 *   node --env-file=.env.migrate scripts/agent-token.mjs <command> --email you@example.com [options]
 *
 * Commands:
 *   create --name "Grok Bot" [--scope read|read_write] [--expires 90d|2027-01-01] [--out FILE]
 *       Make a token. It is printed ONCE, and only to an interactive terminal;
 *       only its SHA-256 is stored. In scripts, pass --out FILE to write
 *       `MEMEX_AGENT_TOKEN=…` to a new file (mode 600; use a gitignored
 *       name such as .env.agent) instead.
 *   list
 *       Every agent token: id, client name, scope, created, expires, last used, revoked.
 *   revoke <token-id>
 *       Revoke one token. memex-api refuses it from the next request on.
 *   revoke-all [--yes] [--dry-run]
 *       The kill switch: revoke every live agent token for the user. Asks you
 *       to type "revoke all" unless --yes. Extension tokens (api_tokens) are
 *       not touched.
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the gitignored
 * .env.migrate holds both). The service-role key bypasses RLS, so every
 * query here filters on the user resolved from --email (or --user <uuid>).
 * Revocation sets revoked_at; rows are never deleted (the audit log points at them).
 */
import { createHash, randomBytes } from 'node:crypto'
import { openSync, writeSync, closeSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const args = process.argv.slice(2)
const command = args[0]
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name) => args.includes(name)

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function die(message) {
  console.error(message)
  process.exit(1)
}

if (!['create', 'list', 'revoke', 'revoke-all'].includes(command)) {
  die('Usage: agent-token.mjs create|list|revoke <id>|revoke-all --email you@example.com (see the header of this file)')
}
if (!URL_BASE || !KEY) die('Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (try node --env-file=.env.migrate …)')

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(method, path, body, prefer) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) die(`${method} ${path.split('?')[0]} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 ? null : res.json()
}

async function resolveUser() {
  const id = flag('--user')
  if (id) {
    if (!UUID_RE.test(id)) die('--user must be a UUID')
    return id
  }
  const email = (flag('--email') || process.env.MEMEX_EMAIL || '').toLowerCase()
  if (!email) die('Pass --email <address> (or --user <uuid>)')
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${URL_BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers })
    if (!res.ok) die(`Looking up users failed (${res.status})`)
    const { users = [] } = await res.json()
    const user = users.find((u) => (u.email || '').toLowerCase() === email)
    if (user) return user.id
    if (users.length < 200) break
  }
  die(`No user with that email`)
}

/** `90d`, `12h`, or a date/time → ISO timestamp in the future. */
function parseExpiry(value) {
  if (!value) return null
  const rel = /^(\d+)([dh])$/.exec(value)
  const ms = rel ? Date.now() + Number(rel[1]) * (rel[2] === 'd' ? 86_400_000 : 3_600_000) : Date.parse(value)
  if (Number.isNaN(ms) || ms <= Date.now()) die('--expires must be like 90d, 12h or a future date (2027-01-01)')
  return new Date(ms).toISOString()
}

const fmt = (ts) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—')

async function create(userId) {
  const name = (flag('--name') || '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 80) die('--name is required (1–80 characters), e.g. --name "Grok Bot"')
  const scope = flag('--scope') || 'read'
  if (!['read', 'read_write'].includes(scope)) die('--scope must be read or read_write')
  const expiresAt = parseExpiry(flag('--expires'))
  const out = flag('--out')
  if (!out && !process.stdout.isTTY) die('Refusing to print a token to a pipe or log. Run in a terminal, or pass --out FILE.')

  const token = `mxa_${randomBytes(32).toString('base64url')}`
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [row] = await rest(
    'POST',
    'agent_tokens?select=id,client_name,scope,expires_at',
    { user_id: userId, client_name: name, scope, token_hash: tokenHash, expires_at: expiresAt },
    'return=representation',
  )

  if (out) {
    // 'wx': never overwrite an existing file.
    const fd = openSync(out, 'wx', 0o600)
    writeSync(fd, `MEMEX_AGENT_TOKEN=${token}\n`)
    closeSync(fd)
    console.log(`Created agent token ${row.id} "${row.client_name}" (${row.scope}, expires ${fmt(row.expires_at)}). Token written to ${out}.`)
  } else {
    console.log(`Created agent token ${row.id} "${row.client_name}" (${row.scope}, expires ${fmt(row.expires_at)}).`)
    console.log('\nCopy it now; it will not be shown again:\n')
    console.log(`  ${token}\n`)
  }
}

async function list(userId) {
  const rows = await rest(
    'GET',
    `agent_tokens?user_id=eq.${userId}&select=id,client_name,scope,created_at,expires_at,last_used_at,revoked_at&order=created_at.asc`,
  )
  if (!rows.length) return console.log('No agent tokens.')
  for (const r of rows) {
    const state = r.revoked_at ? `revoked ${fmt(r.revoked_at)}` : r.expires_at && Date.parse(r.expires_at) <= Date.now() ? 'expired' : 'live'
    console.log(
      `${r.id}  ${r.client_name.padEnd(28)}  ${r.scope.padEnd(10)}  created ${fmt(r.created_at)}  expires ${fmt(r.expires_at)}  used ${fmt(r.last_used_at)}  ${state}`,
    )
  }
}

async function revoke(userId) {
  const id = args[1]
  if (!UUID_RE.test(id || '')) die('Usage: agent-token.mjs revoke <token-id> --email … (ids come from list)')
  const rows = await rest(
    'PATCH',
    `agent_tokens?id=eq.${id}&user_id=eq.${userId}&revoked_at=is.null&select=id,client_name`,
    { revoked_at: new Date().toISOString() },
    'return=representation',
  )
  if (!rows.length) die('No live agent token with that id for this user (already revoked?)')
  console.log(`Revoked ${rows[0].id} "${rows[0].client_name}".`)
}

async function revokeAll(userId) {
  const live = await rest('GET', `agent_tokens?user_id=eq.${userId}&revoked_at=is.null&select=id,client_name`)
  if (!live.length) return console.log('No live agent tokens.')
  console.log(`Live agent tokens: ${live.map((t) => `"${t.client_name}"`).join(', ')}`)
  if (has('--dry-run')) return console.log(`Dry run: would revoke ${live.length}.`)
  if (!has('--yes')) {
    if (!process.stdin.isTTY) die('Pass --yes to revoke all without a prompt.')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`Type "revoke all" to revoke ${live.length} token(s): `)
    rl.close()
    if (answer.trim() !== 'revoke all') die('Nothing revoked.')
  }
  const rows = await rest(
    'PATCH',
    `agent_tokens?user_id=eq.${userId}&revoked_at=is.null&select=id`,
    { revoked_at: new Date().toISOString() },
    'return=representation',
  )
  console.log(`Revoked ${rows.length} agent token(s). Extension tokens are unchanged.`)
}

const userId = await resolveUser()
await { create, list, revoke, 'revoke-all': revokeAll }[command](userId)

/**
 * memex-api — capture API for the browser extension (and any future client).
 *
 * Auth: personal access token (created in memex Settings) via
 * `Authorization: Bearer mx_…`. Only the SHA-256 hash is stored server-side.
 *
 * Routes:
 *   POST   /api/capture            { url, title?, description?, image?, favicon?, note?,
 *                                    source?, sourceId?, list?, lists?, capturedBy?, client?,
 *                                    spaceId?, tagIds? } → created (201) or existing
 *                                    (200, duplicate: true) link
 *   DELETE /api/links/:id          undo a capture
 *   POST   /api/links/:id/spaces   { spaceId } → file a saved link into a space
 *   GET    /api/lookup?url=        { found: false } or { found: true, link } — the saved
 *                                    link that is the same thing as `url` (read-only)
 *   GET    /api/spaces             [{ id, name }]
 *   GET    /api/tags               [{ id, name }]
 *   POST   /mcp                    hosted MCP server for agents (agent tokens, mxa_…;
 *                                    src/mcp/, docs/mcp.md)
 *   POST   /agent-tokens           { name, scope, expires_in_days? } → a new agent token,
 *                                    shown once; auth is the web app's Supabase session
 *                                    (src/agentTokens.ts)
 *
 * The capture rules (identify, dedupe, validate) live in @memex/core
 * (`packages/core/src/capture`), so the hosted MCP server can reuse them.
 * Storage is PostgREST with a service-role key, always through `userScope`
 * (src/db.ts). When the database moves, only this worker changes.
 */
import { CaptureError, createCaptureService, isUuid, parseCaptureInput } from '../../packages/core/src/capture';
import { handleAgentTokens } from './agentTokens';
import { createDb, userScope, type Db, type DbEnv } from './db';
import { BodyTooLargeError, clientIp, overLimit, readBodyLimited, type RateLimiter } from './limits';
import { handleMcp } from './mcp/handler';
import { tryScrape } from './scraper';
import { createPostgrestCaptureStore } from './store';

export interface Env extends DbEnv {
  /** memex-scraper service binding (wrangler.jsonc → services); required on Cloudflare. */
  SCRAPER?: { fetch(input: string): Promise<Response> };
  /** Fallback for local dev without the binding. */
  SCRAPER_URL: string;
  /** Per-token limit for /api/* and /agent-tokens (wrangler.jsonc → ratelimits); optional. */
  RATE_LIMITER?: RateLimiter;
  /** Per-IP limit on every route, checked before any token lookup (src/limits.ts); optional. */
  IP_RATE_LIMITER?: RateLimiter;
  /** Per-agent-token rate limit for /mcp (wrangler.jsonc → ratelimits); optional. */
  MCP_RATE_LIMITER?: RateLimiter;
}

const TOKEN_RE = /^mx_[A-Za-z0-9_-]{20,128}$/;

// Token-gated API: CORS stays wide open so the extension (and future clients)
// can call from any origin without preregistration.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

const error = (message: string, status: number) => json({ success: false, error: message }, status);
const ok = (data: unknown, status = 200) => json({ success: true, data }, status);

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface TokenRow {
  id: string;
  user_id: string;
}

async function authenticate(request: Request, db: Db, ctx: ExecutionContext): Promise<TokenRow | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!TOKEN_RE.test(token)) return null;

  const rows = await db.select<TokenRow>('api_tokens', {
    token_hash: `eq.${await sha256Hex(token)}`,
    select: 'id,user_id',
    limit: '1',
  });
  const row = rows[0];
  if (!row || !isUuid(row.user_id)) return null;

  ctx.waitUntil(
    db.update('api_tokens', { id: `eq.${row.id}` }, { last_used_at: new Date().toISOString() }).catch(() => {}),
  );
  return row;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await readBodyLimited(request); // BodyTooLargeError → 413
  try {
    return JSON.parse(text);
  } catch {
    throw new CaptureError('Invalid JSON body');
  }
}

/** 429 for an IP over its budget, in the shape each route's clients expect. */
function tooManyFromIp(pathname: string): Response {
  const headers = { 'Content-Type': 'application/json', 'Retry-After': '60', ...CORS_HEADERS };
  const body =
    pathname === '/mcp'
      ? { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests from this address; slow down' } }
      : { success: false, error: 'Too many requests from this address, slow down' };
  return new Response(JSON.stringify(body), { status: 429, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);

    // Per-IP brake before anything touches the database (src/limits.ts).
    if (request.method !== 'OPTIONS' && (await overLimit(env.IP_RATE_LIMITER, `ip:${clientIp(request)}`))) {
      return tooManyFromIp(pathname);
    }

    // Hosted MCP for agents: its own tokens (mxa_…), scopes, limits and audit log (src/mcp/).
    if (pathname === '/mcp') return handleMcp(request, env, ctx);
    // Agent token creation for the web app: Supabase session auth, not an access token.
    if (pathname === '/agent-tokens') return handleAgentTokens(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const db = createDb(env);

    let auth: TokenRow | null;
    try {
      auth = await authenticate(request, db, ctx);
    } catch {
      return error('Auth backend unavailable', 502);
    }
    if (!auth) return error('Missing or invalid token', 401);

    if (await overLimit(env.RATE_LIMITER, auth.id)) return error('Too many requests, slow down', 429);

    const user = userScope(db, auth.user_id);
    const capture = createCaptureService(createPostgrestCaptureStore(user), {
      enrich: (url) => tryScrape({ binding: env.SCRAPER, url: env.SCRAPER_URL }, url),
    });

    try {
      if (request.method === 'POST' && pathname === '/api/capture') {
        const parsed = parseCaptureInput(await readJson(request), {
          defaultCapturedBy: 'api',
          allowedCapturedBy: ['extension', 'resync', 'share', 'api'],
        });
        if (!parsed.ok) return error(parsed.error, 400);
        const result = await capture.capture(parsed.value);
        return ok(result, result.duplicate ? 200 : 201);
      }

      const linkSpaces = pathname.match(/^\/api\/links\/([^/]+)\/spaces$/);
      if (request.method === 'POST' && linkSpaces) {
        const body = (await readJson(request)) as { spaceId?: unknown } | null;
        return ok(await capture.addToSpace(linkSpaces[1], String(body?.spaceId ?? '')));
      }

      const link = pathname.match(/^\/api\/links\/([^/]+)$/);
      if (request.method === 'DELETE' && link) {
        return (await capture.remove(link[1])) ? ok({ deleted: true }) : error('Link not found', 404);
      }

      if (request.method === 'GET' && pathname === '/api/lookup') {
        return ok(await capture.lookup(searchParams.get('url') ?? ''));
      }

      if (request.method === 'GET' && pathname === '/api/spaces') {
        return ok(await user.select('profiles', { select: 'id,name', order: 'name.asc' }));
      }

      if (request.method === 'GET' && pathname === '/api/tags') {
        return ok(await user.select('tags', { select: 'id,name', order: 'name.asc' }));
      }

      return error('Not found', 404);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return error(err.message, 413);
      if (err instanceof CaptureError) return error(err.message, err.status);
      console.error('memex-api error', err instanceof Error ? err.message : err);
      return error('memex couldn’t complete that request', 502);
    }
  },
};

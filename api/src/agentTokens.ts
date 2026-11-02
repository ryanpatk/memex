/**
 * POST /agent-tokens: create an MCP agent token for the signed-in user
 * (Settings → Agent tokens in the web app; docs/mcp.md → "Agent tokens").
 *
 * Why server-side: the token is generated here from 32 random bytes, hashed,
 * and only the hash is stored; the plaintext goes back once in this response
 * (`Cache-Control: no-store`) and is never logged. So every token has full
 * entropy, a valid scope, a bounded expiry and a client name, whatever the
 * caller sends, and there's a cap on live tokens. Listing and revoking stay
 * in the app through RLS (agent_tokens policies), so the kill switch works
 * even if this Worker is down.
 *
 * Auth: `Authorization: Bearer <Supabase access token>` (the app's session).
 * The token is checked by Supabase Auth itself (`GET /auth/v1/user`), so
 * nothing here parses or trusts a JWT. Agent tokens (`mxa_…`) and extension
 * tokens (`mx_…`) are refused: neither can mint more tokens.
 */
import { AGENT_SCOPES, isAgentScope, normalizeClientName, type AgentScope } from '../../packages/core/src/agent';
import { isUuid } from '../../packages/core/src/capture';
import { createDb, userScope, type Db, type DbEnv } from './db';
import { sha256Hex } from './mcp/auth';

export const AGENT_TOKEN_LIMITS = {
  /** Live (not revoked, not expired) agent tokens per user. */
  maxLive: 25,
  maxExpiryDays: 365,
} as const;

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_BODY = 4096;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}
const fail = (error: string, status: number) => reply({ success: false, error }, status);

/** `mxa_` + 32 random bytes, base64url (43 characters): the shape AGENT_TOKEN_RE expects. */
export function generateAgentToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `mxa_${b64}`;
}

/** The Supabase user behind a session access token, or null. */
export async function sessionUser(env: DbEnv, header: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!m || !JWT_RE.test(m[1])) return null;
  const res = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${m[1]}` },
  });
  if (!res.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return user && isUuid(user.id) ? user.id : null;
}

export interface CreateTokenInput {
  name: string;
  scope: AgentScope;
  expiresInDays: number | null;
}

export function parseCreateToken(body: unknown): { ok: true; value: CreateTokenInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const name = normalizeClientName(b.name);
  if (!name) return { ok: false, error: 'name is required (1–80 characters), e.g. "Grok Bot: memex project"' };
  const scope = b.scope ?? 'read';
  if (!isAgentScope(scope)) return { ok: false, error: `scope must be ${AGENT_SCOPES.join(' or ')}` };
  let expiresInDays: number | null = null;
  if (b.expires_in_days !== undefined && b.expires_in_days !== null) {
    const d = b.expires_in_days;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > AGENT_TOKEN_LIMITS.maxExpiryDays) {
      return { ok: false, error: `expires_in_days must be a whole number from 1 to ${AGENT_TOKEN_LIMITS.maxExpiryDays}, or null for no expiry` };
    }
    expiresInDays = d;
  }
  return { ok: true, value: { name, scope, expiresInDays } };
}

export interface AgentTokensEnv extends DbEnv {
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export async function handleAgentTokens(
  request: Request,
  env: AgentTokensEnv,
  deps: { db?: Db; fetcher?: typeof fetch; now?: () => Date } = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let userId: string | null;
  try {
    userId = await sessionUser(env, request.headers.get('Authorization'), deps.fetcher);
  } catch {
    return fail('Auth backend unavailable', 502);
  }
  if (!userId) return fail('Sign in to memex to create agent tokens', 401);

  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key: `agent-tokens:${userId}` }).catch(() => ({ success: true }));
    if (!success) return fail('Too many requests, slow down', 429);
  }

  const text = await request.text();
  if (text.length > MAX_BODY) return fail('Body too large', 413);
  let body: unknown;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const parsed = parseCreateToken(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  const { name, scope, expiresInDays } = parsed.value;

  const db = deps.db ?? createDb(env, deps.fetcher);
  const user = userScope(db, userId);
  const now = deps.now?.() ?? new Date();
  try {
    const live = await user.select<{ id: string }>('agent_tokens', {
      select: 'id',
      revoked_at: 'is.null',
      or: `(expires_at.is.null,expires_at.gt.${now.toISOString()})`,
      limit: String(AGENT_TOKEN_LIMITS.maxLive + 1),
    });
    if (live.length >= AGENT_TOKEN_LIMITS.maxLive) {
      return fail(`You already have ${live.length} live agent tokens; revoke some first`, 409);
    }

    const token = generateAgentToken();
    const expires_at = expiresInDays ? new Date(now.getTime() + expiresInDays * 86_400_000).toISOString() : null;
    const rows = await user.insert<{ id: string; client_name: string; scope: AgentScope; created_at: string; expires_at: string | null }>(
      'agent_tokens',
      { client_name: name, scope, token_hash: await sha256Hex(token), expires_at },
    );
    const row = rows[0];
    // The audit log notes the creation (no secrets: ids, scope and expiry only).
    await user
      .insert('mcp_audit_log', {
        token_id: row.id,
        client_name: row.client_name,
        method: 'agent_tokens/create',
        args_summary: { scope, expires_in_days: expiresInDays },
        status: 'ok',
      })
      .catch(() => {});
    return reply(
      {
        success: true,
        data: {
          token,
          agent_token: {
            id: row.id,
            client_name: row.client_name,
            scope: row.scope,
            created_at: row.created_at,
            expires_at: row.expires_at,
            revoked_at: null,
            last_used_at: null,
          },
        },
      },
      201,
    );
  } catch (err) {
    console.error('agent token create failed', err instanceof Error ? err.message : err);
    return fail('memex couldn’t create the token', 502);
  }
}

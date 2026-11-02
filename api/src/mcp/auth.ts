/**
 * Bearer-token auth for /mcp: `Authorization: Bearer mxa_…` (an agent token,
 * `agent_tokens`), looked up by its SHA-256 hash. Revoked and expired tokens
 * are refused on every request, so revocation takes effect immediately.
 * Extension tokens (`mx_…`, `api_tokens`) are never accepted here.
 */
import {
  agentBearerToken,
  checkAgentToken,
  type AgentScope,
  type AgentTokenRow,
} from '../../../packages/core/src/agent';
import type { Db } from '../db';

export interface AgentPrincipal {
  tokenId: string;
  userId: string;
  clientName: string;
  scope: AgentScope;
  expiresAt: string | null;
}

export type AgentAuthResult =
  | { ok: true; principal: AgentPrincipal }
  /** No usable credential: nothing is known about the caller. */
  | { ok: false; reason: 'missing' | 'malformed' | 'unknown' }
  /** A real token that may not be used (its owner is known, so the refusal is audited). */
  | { ok: false; reason: 'revoked' | 'expired' | 'invalid'; token: AgentTokenRow };

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** last_used_at is written at most this often per token, to spare the database. */
const TOUCH_EVERY_MS = 60_000;

export async function authenticateAgent(
  request: Request,
  db: Db,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  now: Date = new Date(),
): Promise<AgentAuthResult> {
  const header = request.headers.get('Authorization');
  if (!header) return { ok: false, reason: 'missing' };
  const token = agentBearerToken(header);
  if (!token) return { ok: false, reason: 'malformed' };

  const rows = await db.select<AgentTokenRow & { last_used_at: string | null }>('agent_tokens', {
    token_hash: `eq.${await sha256Hex(token)}`,
    select: 'id,user_id,client_name,scope,expires_at,revoked_at,last_used_at',
    limit: '1',
  });
  const row = rows[0];
  if (!row) return { ok: false, reason: 'unknown' };

  const check = checkAgentToken(row, now);
  if (!check.ok) return { ok: false, reason: check.reason, token: row };

  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > TOUCH_EVERY_MS) {
    ctx.waitUntil(
      db.update('agent_tokens', { id: `eq.${row.id}` }, { last_used_at: now.toISOString() }).catch(() => {}),
    );
  }
  return {
    ok: true,
    principal: {
      tokenId: row.id,
      userId: row.user_id,
      clientName: row.client_name,
      scope: check.scope,
      expiresAt: row.expires_at,
    },
  };
}

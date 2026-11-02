/*
 * Agent tokens (the `agent_tokens` table): one per MCP client, scoped,
 * revocable, optionally expiring. Separate from the extension's `api_tokens`
 * (`mx_…`), which keep working unchanged and are never accepted at /mcp; an
 * agent token (`mxa_…`) is never accepted by the capture routes.
 *
 * The plaintext is `mxa_` + 32 random bytes in base64url (43 characters),
 * shown once when created. Only its SHA-256 (hex) is stored.
 */
import { isUuid } from '../capture/input';

export const AGENT_TOKEN_PREFIX = 'mxa_';
export const AGENT_TOKEN_RE = /^mxa_[A-Za-z0-9_-]{43}$/;

export const AGENT_SCOPES = ['read', 'read_write'] as const;
/** `read`: the read tools. `read_write`: also the (non-destructive) write tools. */
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const isAgentScope = (value: unknown): value is AgentScope => AGENT_SCOPES.includes(value as AgentScope);

/** What a tool needs. There is no "delete" access: no tool deletes or bulk-edits. */
export type ToolAccess = 'read' | 'write';

export const scopeAllows = (scope: AgentScope, access: ToolAccess): boolean =>
  access === 'read' ? scope === 'read' || scope === 'read_write' : scope === 'read_write';

/** The scopes advertised to the MCP layer (`AuthInfo.scopes`). */
export const scopeList = (scope: AgentScope): ToolAccess[] => (scope === 'read_write' ? ['read', 'write'] : ['read']);

/** An `agent_tokens` row as auth reads it (never the hash). */
export interface AgentTokenRow {
  id: string;
  user_id: string;
  client_name: string;
  scope: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export type AgentTokenCheck =
  | { ok: true; scope: AgentScope }
  | { ok: false; reason: 'revoked' | 'expired' | 'invalid' };

/** Whether a found token may be used right now. Revocation wins over everything. */
export function checkAgentToken(row: AgentTokenRow, now: Date): AgentTokenCheck {
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return { ok: false, reason: 'expired' };
  if (!isUuid(row.user_id) || !isAgentScope(row.scope)) return { ok: false, reason: 'invalid' };
  return { ok: true, scope: row.scope };
}

/**
 * The token in `Authorization: Bearer mxa_…`, or null when it isn't shaped
 * like one. A bare `Authorization: mxa_…` is accepted too: some hosted
 * connectors (xAI's `authorization` field) don't say whether they add the
 * scheme, and the token's own shape is unambiguous.
 */
export function agentBearerToken(header: string | null | undefined): string | null {
  const m = /^(?:Bearer\s+)?(\S+)\s*$/i.exec((header ?? '').trim());
  return m && AGENT_TOKEN_RE.test(m[1]) ? m[1] : null;
}

/** Client names are labels in Settings and the audit log: short, printable. */
export function normalizeClientName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= 80 ? name : null;
}

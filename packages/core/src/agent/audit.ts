/*
 * What the MCP audit log (`mcp_audit_log`) keeps about each call's arguments:
 * enough to see what an agent asked for, never the content it sent. Ids,
 * enums, dates, numbers and booleans are kept; free text is reduced to its
 * length; cursors to "present"; anything nested to its size.
 */

/** Argument names whose short string values are identifiers or enums, safe to keep. */
const KEPT_STRINGS = new Set(['type', 'id', 'space_id', 'source', 'from', 'to', 'timezone', 'bucket', 'direction']);
const KEPT_LISTS = new Set(['types']);
const MAX_KEYS = 20;
const MAX_KEPT_CHARS = 64;

export type ArgsSummary = Record<string, string | number | boolean | null | string[] | { chars: number } | { items: number }>;

export function summarizeArgs(args: unknown): ArgsSummary {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const out: ArgsSummary = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>).slice(0, MAX_KEYS)) {
    const name = key.slice(0, 40);
    if (value === null || typeof value === 'number' || typeof value === 'boolean') out[name] = value;
    else if (typeof value === 'string') {
      if (key === 'cursor') out[name] = 'present';
      else if (KEPT_STRINGS.has(key) && value.length <= MAX_KEPT_CHARS) out[name] = value;
      else out[name] = { chars: value.length };
    } else if (Array.isArray(value)) {
      const keep =
        KEPT_LISTS.has(key) &&
        value.length <= 10 &&
        value.every((v) => typeof v === 'string' && v.length <= 16);
      out[name] = keep ? (value as string[]) : { items: value.length };
    } else out[name] = { items: Object.keys(value as object).length };
  }
  return out;
}

export const AUDIT_STATUSES = ['ok', 'error', 'denied', 'invalid', 'rate_limited'] as const;
/**
 * `ok`: answered. `error`: the tool failed (bad arguments, not found, a
 * backend error). `denied`: the token may not do this (scope, revoked,
 * expired). `invalid`: not a well-formed MCP message. `rate_limited`: over
 * the per-token limit (logged about once a minute per token and Worker instance).
 */
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

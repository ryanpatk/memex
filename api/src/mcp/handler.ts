/**
 * POST /mcp: memex's hosted MCP server (Streamable HTTP, stateless).
 *
 * Order of business for every request:
 *   1. auth: `Authorization: Bearer mxa_…` → an `agent_tokens` row that isn't
 *      revoked or expired (auth.ts); otherwise 401
 *   2. per-token rate limit (MCP_RATE_LIMITER) → 429
 *   3. body: ≤ 64 KB of JSON, ≤ 20 messages
 *   4. the MCP SDK (`createMcpHandler`, one fresh McpServer per request):
 *      2026-07-28 clients (no handshake) and 2025-era clients (initialize,
 *      no session id) are both served statelessly
 *   5. audit: one `mcp_audit_log` row per message, written after the
 *      response has been produced (ctx.waitUntil), with the outcome read
 *      from the response itself
 *
 * Tools are registered only if the token's scope allows them, and each call
 * checks again. The write service is built only for `read_write` tokens. All
 * data access goes through `userScope` for the token's user.
 */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { CaptureError, createCaptureService } from '../../../packages/core/src/capture';
import {
  AgentInputError,
  AgentNotFoundError,
  createAgentReadService,
  createAgentWriteService,
  scopeAllows,
  scopeList,
  summarizeArgs,
  type ArgsSummary,
  type AuditStatus,
} from '../../../packages/core/src/agent';
import { createDb, userScope, type Db, type DbEnv } from '../db';
import { authenticateAgent, type AgentPrincipal } from './auth';
import { tryScrape } from '../scraper';
import { createPostgrestCaptureStore } from '../store';
import { createPostgrestAgentStore } from './store';
import { READ_INSTRUCTIONS, TOOLS, WRITE_INSTRUCTIONS, type ToolContext, type ToolDef } from './tools';
import { createPostgrestAgentWriteStore } from './writeStore';

export const SERVER_INFO = { name: 'memex', title: 'memex', version: '0.1.0' };

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface McpEnv extends DbEnv {
  /** Workers rate limiting binding for /mcp (wrangler.jsonc → ratelimits); optional. */
  MCP_RATE_LIMITER?: RateLimiter;
  /** memex-scraper, so save_link fills in titles and pictures like the extension's captures. */
  SCRAPER?: { fetch(input: string): Promise<Response> };
  SCRAPER_URL?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 20;
const RATE_LOG_EVERY_MS = 60_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate, Retry-After',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** A JSON-RPC error outside any request (auth, limits, parse errors). */
function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ── audit ──────────────────────────────────────────────────────────────────

export interface AuditRow {
  token_id: string;
  client_name: string;
  method: string;
  tool: string | null;
  args_summary: ArgsSummary;
  status: AuditStatus;
  error: string | null;
  result_count: number | null;
  duration_ms: number | null;
  /** What a write produced ("note:<id>", "proposal:<id>"); ids only. */
  result_ref?: string | null;
}

/** What a tool callback reports about its own run. */
interface ToolOutcome {
  tool: string;
  status: AuditStatus;
  error: string | null;
  count: number | null;
  ref: string | null;
  ms: number;
}

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type ResponseInfo = { error?: { code?: number; message?: string }; isError?: boolean; text?: string };

/** JSON-RPC responses in the SDK's reply (JSON or SSE), by request id. */
function responsesById(contentType: string, body: string): Map<string, ResponseInfo> {
  const out = new Map<string, ResponseInfo>();
  const payloads: unknown[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        payloads.push(JSON.parse(line.slice(5).trim()));
      } catch {
        /* keepalive or partial frame */
      }
    }
  } else if (body) {
    try {
      payloads.push(JSON.parse(body));
    } catch {
      return out;
    }
  }
  for (const p of payloads.flat()) {
    if (!p || typeof p !== 'object') continue;
    const m = p as { id?: unknown; error?: ResponseInfo['error']; result?: { isError?: boolean; content?: { type: string; text?: string }[] } };
    if (m.id === undefined || m.id === null) continue;
    const text = m.result?.content?.find((c) => c.type === 'text')?.text;
    out.set(JSON.stringify(m.id), { error: m.error, isError: m.result?.isError === true, text });
  }
  return out;
}

/** One audit row per message the client sent, completed from the response and the tools' own reports. */
export function buildAuditRows(
  principal: AgentPrincipal,
  messages: Message[],
  responses: Map<string, ResponseInfo>,
  outcomes: ToolOutcome[],
): AuditRow[] {
  const pending = [...outcomes];
  return messages.map((msg) => {
    const row: AuditRow = {
      token_id: principal.tokenId,
      client_name: principal.clientName,
      method: typeof msg?.method === 'string' ? clip(msg.method, 100) : '(invalid)',
      tool: null,
      args_summary: {},
      status: typeof msg?.method === 'string' ? 'ok' : 'invalid',
      error: null,
      result_count: null,
      duration_ms: null,
    };
    if (row.status === 'invalid') return row;
    const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
    const res = msg.id !== undefined && msg.id !== null ? responses.get(JSON.stringify(msg.id)) : undefined;

    if (row.method === 'initialize') {
      const info = (params.clientInfo ?? {}) as { name?: unknown };
      row.args_summary = {
        protocol_version: typeof params.protocolVersion === 'string' ? clip(params.protocolVersion, 32) : null,
        client: typeof info.name === 'string' ? clip(info.name, 64) : null,
      };
    }

    if (row.method === 'tools/call') {
      const tool = typeof params.name === 'string' ? clip(params.name, 100) : null;
      row.tool = tool;
      row.args_summary = summarizeArgs(params.arguments);
      const i = pending.findIndex((o) => o.tool === tool);
      const outcome = i >= 0 ? pending.splice(i, 1)[0] : null;
      const access = TOOLS.find((t) => t.name === tool)?.access;
      if (outcome) {
        row.status = outcome.status;
        row.error = outcome.error;
        row.result_count = outcome.count;
        row.duration_ms = outcome.ms;
        if (outcome.ref) row.result_ref = outcome.ref;
      } else if (access && !scopeAllows(principal.scope, access)) {
        row.status = 'denied';
        row.error = `scope ${principal.scope} does not allow ${access} tools`;
      } else if (res?.error || res?.isError) {
        // Rejected by the SDK before our callback ran: unknown tool, bad arguments.
        row.status = 'error';
        row.error = clip(res.error?.message ?? res.text ?? 'error', 200);
      }
      return row;
    }

    if (res?.error) {
      row.status = 'error';
      row.error = clip(`${res.error.code ?? ''} ${res.error.message ?? ''}`.trim(), 200);
    }
    return row;
  });
}

async function writeAudit(db: Db, principal: AgentPrincipal, rows: AuditRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    await userScope(db, principal.userId).insert('mcp_audit_log', rows as unknown as Record<string, unknown>[]);
  } catch (err) {
    console.error('mcp audit write failed', err instanceof Error ? err.message : err);
  }
}

const singleRow = (principal: AgentPrincipal, method: string, status: AuditStatus, error: string): AuditRow => ({
  token_id: principal.tokenId,
  client_name: principal.clientName,
  method,
  tool: null,
  args_summary: {},
  status,
  error,
  result_count: null,
  duration_ms: null,
});

// ── tools ──────────────────────────────────────────────────────────────────

const errorResult = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] });

async function runTool(tool: ToolDef, args: unknown, principal: AgentPrincipal, ctx: ToolContext, outcomes: ToolOutcome[]) {
  const started = Date.now();
  const outcome: ToolOutcome = { tool: tool.name, status: 'ok', error: null, count: null, ref: null, ms: 0 };
  outcomes.push(outcome);
  try {
    if (!scopeAllows(principal.scope, tool.access)) {
      outcome.status = 'denied';
      outcome.error = `scope ${principal.scope} does not allow ${tool.access} tools`;
      return errorResult(`This token (scope: ${principal.scope}) can't use ${tool.name}.`);
    }
    const result = await tool.run(ctx, args ?? {});
    outcome.count = tool.count(result);
    outcome.ref = tool.ref?.(result) ?? null;
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (err) {
    outcome.status = 'error';
    if (err instanceof AgentInputError || err instanceof AgentNotFoundError || err instanceof CaptureError) {
      outcome.error = clip(err.message, 200);
      return errorResult(err.message);
    }
    console.error('mcp tool failed', tool.name, err instanceof Error ? err.message : err);
    outcome.error = 'internal error';
    return errorResult('memex couldn’t complete that request. Try again shortly.');
  } finally {
    outcome.ms = Date.now() - started;
  }
}

/** A fresh server for one request, with only the tools this token may use. */
export function buildServer(principal: AgentPrincipal, ctx: ToolContext, outcomes: ToolOutcome[]): McpServer {
  const canWrite = scopeAllows(principal.scope, 'write');
  const server = new McpServer(SERVER_INFO, { instructions: canWrite ? WRITE_INSTRUCTIONS : READ_INSTRUCTIONS });
  for (const tool of TOOLS) {
    if (!scopeAllows(principal.scope, tool.access)) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.access === 'read',
          // Write tools only add items or file proposals: nothing is overwritten or deleted.
          destructiveHint: false,
          idempotentHint: tool.access === 'read',
          openWorldHint: false,
        },
      },
      (args: unknown) => runTool(tool, args, principal, ctx, outcomes),
    );
  }
  return server;
}

// ── the endpoint ───────────────────────────────────────────────────────────

/** When each token last had a rate_limited row written (per isolate). */
const rateLogged = new Map<string, number>();

async function rateLimited(env: McpEnv, tokenId: string): Promise<boolean> {
  if (!env.MCP_RATE_LIMITER) return false;
  const { success } = await env.MCP_RATE_LIMITER.limit({ key: `mcp:${tokenId}` }).catch(() => ({ success: true }));
  return !success;
}

export async function handleMcp(
  request: Request,
  env: McpEnv,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  deps: { db?: Db; now?: () => Date } = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const db = deps.db ?? createDb(env);
  const now = deps.now?.() ?? new Date();

  let auth;
  try {
    auth = await authenticateAgent(request, db, ctx, now);
  } catch (err) {
    console.error('mcp auth backend error', err instanceof Error ? err.message : err);
    return rpcError(503, -32603, 'Auth backend unavailable', { 'Retry-After': '5' });
  }

  if (!auth.ok) {
    if ('token' in auth) {
      // A real token that's revoked or expired: its owner is known, so audit the refusal
      // (behind the rate limit, so a stuck client can't flood the log).
      const t = auth.token;
      const principal: AgentPrincipal = { tokenId: t.id, userId: t.user_id, clientName: t.client_name, scope: 'read', expiresAt: t.expires_at };
      if (!(await rateLimited(env, t.id))) {
        ctx.waitUntil(writeAudit(db, principal, [singleRow(principal, 'auth', 'denied', `token ${auth.reason}`)]));
      }
    }
    const message =
      auth.reason === 'missing'
        ? 'Missing token: send Authorization: Bearer mxa_…'
        : auth.reason === 'revoked'
          ? 'This token has been revoked'
          : auth.reason === 'expired'
            ? 'This token has expired'
            : 'Invalid token';
    return rpcError(401, -32001, message, {
      'WWW-Authenticate': auth.reason === 'missing' ? 'Bearer realm="memex"' : 'Bearer realm="memex", error="invalid_token"',
    });
  }

  const principal = auth.principal;

  if (await rateLimited(env, principal.tokenId)) {
    const last = rateLogged.get(principal.tokenId) ?? 0;
    if (now.getTime() - last > RATE_LOG_EVERY_MS) {
      rateLogged.set(principal.tokenId, now.getTime());
      ctx.waitUntil(writeAudit(db, principal, [singleRow(principal, 'rate_limit', 'rate_limited', 'per-token limit reached')]));
    }
    return rpcError(429, -32000, 'Too many requests for this token; slow down', { 'Retry-After': '60' });
  }

  // GET (a 2025 SSE stream) and DELETE (end a session) don't apply to a stateless
  // server. 2025-era clients probe GET after initialize and expect this 405; it
  // carries no MCP message, so it isn't audited.
  if (request.method !== 'POST') {
    return rpcError(405, -32000, 'Method not allowed: this server is stateless, POST JSON-RPC messages', { Allow: 'POST, OPTIONS' });
  }

  const declared = Number(request.headers.get('Content-Length') ?? 0);
  const text = declared > MAX_BODY_BYTES ? null : await request.text();
  if (text === null || text.length > MAX_BODY_BYTES) {
    ctx.waitUntil(writeAudit(db, principal, [singleRow(principal, '(body)', 'invalid', 'body too large')]));
    return rpcError(413, -32600, 'Request body too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    ctx.waitUntil(writeAudit(db, principal, [singleRow(principal, '(body)', 'invalid', 'parse error')]));
    return rpcError(400, -32700, 'Parse error: the body must be JSON-RPC');
  }
  const messages = (Array.isArray(body) ? body : [body]) as Message[];
  if (messages.length === 0 || messages.length > MAX_BATCH) {
    ctx.waitUntil(writeAudit(db, principal, [singleRow(principal, '(batch)', 'invalid', `batch of ${messages.length}`)]));
    return rpcError(400, -32600, `Send between 1 and ${MAX_BATCH} messages per request`);
  }

  const outcomes: ToolOutcome[] = [];
  const user = userScope(db, principal.userId);
  const reads = createAgentReadService(createPostgrestAgentStore(user), { now: () => now });
  const writes = scopeAllows(principal.scope, 'write')
    ? createAgentWriteService(createPostgrestAgentWriteStore(user), {
        writer: { clientName: principal.clientName, tokenId: principal.tokenId },
        capture: createCaptureService(createPostgrestCaptureStore(user), {
          enrich: (url) => tryScrape({ binding: env.SCRAPER, url: env.SCRAPER_URL ?? '' }, url),
        }),
        now: () => now,
      })
    : null;
  const handler = createMcpHandler(() => buildServer(principal, { reads, writes }, outcomes), {
    onerror: (err) => console.warn('mcp handler', err.message),
  });

  const sdkRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: text });
  const response = await handler.fetch(sdkRequest, {
    parsedBody: body,
    authInfo: {
      token: principal.tokenId, // the token's id, never its secret
      clientId: principal.clientName,
      scopes: scopeList(principal.scope),
      expiresAt: principal.expiresAt ? Math.floor(Date.parse(principal.expiresAt) / 1000) : undefined,
      extra: { userId: principal.userId },
    },
  });

  // Audit once the reply is complete: read a copy of the body for each message's outcome.
  let forClient: ReadableStream | null = response.body;
  let forAudit: ReadableStream | null = null;
  if (response.body) [forClient, forAudit] = response.body.tee();
  const contentType = response.headers.get('Content-Type') ?? '';
  ctx.waitUntil(
    (async () => {
      const replied = forAudit ? await new Response(forAudit).text().catch(() => '') : '';
      await writeAudit(db, principal, buildAuditRows(principal, messages, responsesById(contentType, replied), outcomes));
    })(),
  );

  return withCors(new Response(forClient, { status: response.status, statusText: response.statusText, headers: response.headers }));
}

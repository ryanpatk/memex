import { describe, expect, it, vi } from 'vitest';
import { AGENT_TOKEN_RE } from '../../packages/core/src/agent';
import { AGENT_TOKEN_LIMITS, generateAgentToken, handleAgentTokens, parseCreateToken } from './agentTokens';
import { createDb } from './db';
import { sha256Hex } from './mcp/auth';

const USER = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'service-key' };
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl';
const NOW = new Date('2026-11-01T12:00:00Z');

function backend(opts: { live?: number; authOk?: boolean } = {}) {
  const calls: { method: string; path: string; params: URLSearchParams; body: unknown; headers: Headers }[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push({ method, path: url.pathname, params: url.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init.headers) });
    if (url.pathname === '/auth/v1/user') {
      return opts.authOk === false ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ id: USER }));
    }
    if (url.pathname === '/rest/v1/agent_tokens' && method === 'GET') {
      return new Response(JSON.stringify(Array.from({ length: opts.live ?? 0 }, (_, i) => ({ id: `t${i}` }))));
    }
    if (url.pathname === '/rest/v1/agent_tokens' && method === 'POST') {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ ...body, id: '22222222-2222-4222-8222-222222222222', created_at: NOW.toISOString() }]), { status: 201 });
    }
    return new Response('[]', { status: 201 });
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

const request = (body: unknown, auth: string | null = `Bearer ${JWT}`) =>
  new Request('https://api.example/agent-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

const run = (req: Request, b: ReturnType<typeof backend>) =>
  handleAgentTokens(req, env, { db: createDb(env, b.fetcher), fetcher: b.fetcher, now: () => NOW });

describe('POST /agent-tokens', () => {
  it('creates a token server-side, stores only its hash and returns it once', async () => {
    const b = backend();
    const res = await run(request({ name: '[test] Grok Bot', scope: 'read_write', expires_in_days: 7 }), b);
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { data } = (await res.json()) as { data: { token: string; agent_token: Record<string, unknown> } };
    expect(data.token).toMatch(AGENT_TOKEN_RE);
    expect(data.agent_token).toMatchObject({ client_name: '[test] Grok Bot', scope: 'read_write', expires_at: '2026-11-08T12:00:00.000Z' });
    expect(JSON.stringify(data.agent_token)).not.toContain('hash');

    const insert = b.calls.find((c) => c.path === '/rest/v1/agent_tokens' && c.method === 'POST')!;
    expect(insert.body).toEqual({
      client_name: '[test] Grok Bot',
      scope: 'read_write',
      token_hash: await sha256Hex(data.token),
      expires_at: '2026-11-08T12:00:00.000Z',
      user_id: USER,
    });
    // The session was checked by Supabase Auth with the caller's own token.
    const auth = b.calls.find((c) => c.path === '/auth/v1/user')!;
    expect(auth.headers.get('Authorization')).toBe(`Bearer ${JWT}`);
    // The plaintext appears nowhere but the response: not in the insert, not in the audit row.
    const everythingSent = JSON.stringify(b.calls.map((c) => c.body));
    expect(everythingSent).not.toContain(data.token);
    expect(b.calls.find((c) => c.path === '/rest/v1/mcp_audit_log')!.body).toMatchObject({ method: 'agent_tokens/create', status: 'ok', user_id: USER });
  });

  it('refuses callers without a valid session, including agent and extension tokens', async () => {
    for (const auth of [null, `Bearer mxa_${'a'.repeat(43)}`, `Bearer mx_${'a'.repeat(43)}`, 'Basic abc']) {
      const b = backend();
      const res = await run(request({ name: 'x' }, auth), b);
      expect(res.status).toBe(401);
      expect(b.calls).toEqual([]);
    }
    const b = backend({ authOk: false });
    expect((await run(request({ name: 'x' }), b)).status).toBe(401);
    expect(b.calls.map((c) => c.path)).toEqual(['/auth/v1/user']);
  });

  it('validates the request and caps live tokens', async () => {
    expect((await run(request({ name: '' }), backend())).status).toBe(400);
    expect((await run(request({ name: 'ok', scope: 'admin' }), backend())).status).toBe(400);
    expect((await run(request({ name: 'ok', expires_in_days: 0 }), backend())).status).toBe(400);
    expect((await run(request({ name: 'ok', expires_in_days: 9999 }), backend())).status).toBe(400);
    const full = backend({ live: AGENT_TOKEN_LIMITS.maxLive });
    expect((await run(request({ name: 'ok' }), full)).status).toBe(409);
    expect(full.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('refuses oversized bodies with 413 and writes nothing', async () => {
    const b = backend();
    const res = await run(request({ name: 'x'.repeat(5000), scope: 'read' }), b);
    expect(res.status).toBe(413);
    expect(b.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('defaults to read scope and no expiry', () => {
    expect(parseCreateToken({ name: '  Claude   Code ' })).toEqual({ ok: true, value: { name: 'Claude Code', scope: 'read', expiresInDays: null } });
  });

  it('generates full-entropy tokens in the agent token shape', () => {
    const a = generateAgentToken();
    expect(a).toMatch(AGENT_TOKEN_RE);
    expect(generateAgentToken()).not.toBe(a);
  });
});

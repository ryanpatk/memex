import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN = `mx_${'a'.repeat(43)}`;
const env: Env = { SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'k', SCRAPER_URL: '' };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

/** Fake PostgREST: a valid token, no links yet. */
const fakeDb = (onRequest: (url: URL, init: RequestInit) => Response | undefined = () => undefined) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const custom = onRequest(url, init);
      if (custom) return custom;
      if (url.pathname.endsWith('/api_tokens')) {
        return new Response(init.method === 'PATCH' ? null : JSON.stringify([{ id: 'tok', user_id: USER }]), { status: init.method === 'PATCH' ? 204 : 200 });
      }
      return new Response('[]');
    }),
  );

const call = (path: string, init: RequestInit = {}, token = TOKEN) =>
  worker.fetch(new Request(`https://api.example${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } }), env, ctx);

afterEach(() => vi.unstubAllGlobals());

describe('memex-api routes', () => {
  it('rejects missing and malformed tokens before touching the database', async () => {
    fakeDb();
    expect((await call('/api/tags', {}, '')).status).toBe(401);
    expect((await call('/api/tags', {}, 'mx_short')).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 400 for invalid capture bodies and ids', async () => {
    fakeDb();
    const post = (body: unknown) => call('/api/capture', { method: 'POST', body: JSON.stringify(body) });
    expect((await post({ url: 'javascript:alert(1)' })).status).toBe(400);
    expect(await (await post({ url: 'https://example.com', spaceId: 'nope' })).json()).toEqual({ success: false, error: 'spaceId must be a UUID' });
    expect((await call('/api/capture', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call('/api/links/not-a-uuid', { method: 'DELETE' })).status).toBe(400);
    expect((await call('/api/lookup?url=ftp://x')).status).toBe(400);
  });

  it('looks up without writing', async () => {
    fakeDb();
    const res = await call(`/api/lookup?url=${encodeURIComponent('https://youtu.be/dQw4w9WgXcQ')}`);
    expect(await res.json()).toEqual({ success: true, data: { found: false } });
    const methods = vi.mocked(fetch).mock.calls.map(([, init]) => init?.method ?? 'GET');
    expect(methods.filter((m) => m !== 'GET' && m !== 'PATCH')).toEqual([]);
  });

  it('returns 429 when the rate limiter says so', async () => {
    fakeDb();
    const limited = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const res = await worker.fetch(new Request('https://api.example/api/tags', { headers: { Authorization: `Bearer ${TOKEN}` } }), limited, ctx);
    expect(res.status).toBe(429);
  });

  it('hides database details behind a generic 502', async () => {
    fakeDb((url) => (url.pathname.endsWith('/tags') ? new Response('{"message":"secret detail"}', { status: 500 }) : undefined));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('/api/tags');
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('refuses oversized bodies with 413, declared or streamed', async () => {
    fakeDb();
    const big = JSON.stringify({ url: 'https://example.com', note: 'x'.repeat(70 * 1024) });
    const res = await call('/api/capture', { method: 'POST', body: big });
    expect(res.status).toBe(413);
    expect((await call('/api/links/11111111-1111-4111-8111-111111111111/spaces', { method: 'POST', body: big })).status).toBe(413);
    const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toEqual([]);
  });

  it('limits each IP before looking up any token, on every route', async () => {
    fakeDb();
    const seen: string[] = [];
    const limited: Env = { ...env, IP_RATE_LIMITER: { limit: async ({ key }) => (seen.push(key), { success: false }) } };
    const req = (path: string, init: RequestInit = {}) =>
      worker.fetch(
        new Request(`https://api.example${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'CF-Connecting-IP': '203.0.113.7' } }),
        limited,
        ctx,
      );
    expect((await req('/api/tags')).status).toBe(429);
    const mcp = await req('/mcp', { method: 'POST', body: '{}' });
    expect(mcp.status).toBe(429);
    expect(await mcp.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
    expect((await req('/agent-tokens', { method: 'POST', body: '{}' })).status).toBe(429);
    expect(seen).toEqual(['ip:203.0.113.7', 'ip:203.0.113.7', 'ip:203.0.113.7']);
    expect(fetch).not.toHaveBeenCalled();
    // CORS preflights are never limited.
    expect((await req('/api/tags', { method: 'OPTIONS' })).status).toBe(204);
  });

  it('scopes every query to the token owner and refuses another user\'s space', async () => {
    // Another user's space id: under user_id=eq.<owner> PostgREST finds nothing.
    fakeDb();
    const OTHER_SPACE = '99999999-9999-4999-8999-999999999999';
    const res = await call('/api/links/11111111-1111-4111-8111-111111111111/spaces', {
      method: 'POST',
      body: JSON.stringify({ spaceId: OTHER_SPACE, user_id: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(res.status).toBe(404);
    const calls = vi.mocked(fetch).mock.calls.map(([input, init]) => ({ url: new URL(String(input)), method: init?.method ?? 'GET' }));
    const userReads = calls.filter((c) => c.method === 'GET' && !c.url.pathname.endsWith('/api_tokens'));
    expect(userReads.length).toBeGreaterThan(0);
    expect(userReads.every((c) => c.url.searchParams.get('user_id') === `eq.${USER}`)).toBe(true);
    expect(calls.some((c) => c.url.pathname.endsWith('/profile_links'))).toBe(false);
  });
});

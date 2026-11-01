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
});

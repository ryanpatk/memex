import { describe, expect, it, vi } from 'vitest';
import { createDb, inList, pgQuote, userScope } from './db';

const USER = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://db.example.co/', SUPABASE_SERVICE_KEY: 'service-key' };

const recorder = (body: unknown = [], status = 200) => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
};

describe('userScope', () => {
  it('adds the user filter to every read, update and delete', async () => {
    const { calls, fetcher } = recorder();
    const user = userScope(createDb(env, fetcher), USER);
    await user.select('links', { select: 'id', user_id: 'eq.someone-else' });
    await user.update('links', { id: 'eq.1' }, { lists: ['saved'], user_id: 'someone-else' });
    await user.delete('tags', { id: 'eq.2' });
    for (const { url } of calls) expect(url.searchParams.get('user_id')).toBe(`eq.${USER}`);
    expect(calls[0].url.pathname).toBe('/rest/v1/links');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ lists: ['saved'] });
  });

  it('stamps the user on inserts, overriding anything sent', async () => {
    const { calls, fetcher } = recorder([{ id: 'x' }], 201);
    const user = userScope(createDb(env, fetcher), USER);
    await user.insert('links', { url: 'https://a', user_id: 'attacker' });
    await user.insert('tags', [{ name: 'a' }, { name: 'b' }]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ url: 'https://a', user_id: USER });
    expect(JSON.parse(String(calls[1].init.body)).map((r: { user_id: string }) => r.user_id)).toEqual([USER, USER]);
  });

  it('refuses a non-UUID user', () => {
    expect(() => userScope(createDb(env), 'eq.x,or=(true)')).toThrow();
  });

  it('writes join rows idempotently', async () => {
    const { calls, fetcher } = recorder(null, 201);
    await userScope(createDb(env, fetcher), USER).joinInsert('profile_links', [{ profile_id: 'p', link_id: 'l' }], 'profile_id,link_id');
    expect(calls[0].url.searchParams.get('on_conflict')).toBe('profile_id,link_id');
    expect((calls[0].init.headers as Record<string, string>).Prefer).toContain('ignore-duplicates');
  });
});

describe('createDb', () => {
  it('sends the service key and surfaces the Postgres error code', async () => {
    const { calls, fetcher } = recorder({ code: '23505', message: 'duplicate key' }, 409);
    const db = createDb(env, fetcher);
    await expect(db.insert('links', {})).rejects.toMatchObject({ status: 409, code: '23505' });
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe('service-key');
  });
});

describe('helpers', () => {
  it('quotes PostgREST values', () => {
    expect(pgQuote('a,b')).toBe('"a,b"');
    expect(pgQuote('say "hi" \\')).toBe('"say \\"hi\\" \\\\"');
  });
  it('builds in-lists from UUIDs only', () => {
    expect(inList([USER])).toBe(`in.(${USER})`);
    expect(() => inList([`${USER}),user_id.neq.(x`])).toThrow();
  });
});

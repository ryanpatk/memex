import { describe, expect, it, vi } from 'vitest';
import { CaptureConflictError, linkMatchFor } from '../../packages/core/src/capture';
import { createDb, userScope } from './db';
import { candidateFilter, createPostgrestCaptureStore } from './store';

const USER = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'k' };

describe('candidateFilter', () => {
  it('matches by source id, url key, URL spellings and legacy id fragments', () => {
    const f = candidateFilter(linkMatchFor('https://x.com/jack/status/20'));
    expect(f).toMatch(/^\(and\(source\.eq\."x",source_id\.eq\."20"\),url_key\.eq\."x\.com\/jack\/status\/20",url\.in\.\(/);
    expect(f).toContain('url.like."*/status/20*"');
    expect(f).toContain('"https://x.com/jack/status/20/"');
  });

  it('has no source-id term for web pages and quotes awkward URLs', () => {
    const f = candidateFilter(linkMatchFor('https://example.com/a,b?q="x"'));
    expect(f).not.toContain('source_id');
    expect(f).toContain('"https://example.com/a,b?q=\\"x\\""');
  });
});

describe('createPostgrestCaptureStore', () => {
  const store = (respond: (url: URL, init: RequestInit) => Response) => {
    const calls: URL[] = [];
    const bodies: unknown[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === 'POST') bodies.push(JSON.parse(String(init.body)));
      else calls.push(url);
      return respond(url, init ?? {});
    }) as unknown as typeof fetch;
    return { calls, bodies, store: createPostgrestCaptureStore(userScope(createDb(env, fetcher), USER)) };
  };
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('scopes every query to the user and maps a unique violation to CaptureConflictError', async () => {
    const { calls, bodies, store: s } = store((url, init) => {
      if (url.pathname.endsWith('/projects')) return ok([{ id: 'proj' }]);
      if (init.method === 'POST') return ok({ code: '23505' }, 409);
      return ok([{ order_index: 3 }]);
    });
    await expect(
      s.insertLink({
        url: 'https://x.com/a/status/1', title: null, description: null, favicon_url: null, preview_image_url: null,
        source: 'x', source_id: '1', lists: [], captured_by: 'api', captured_client: null, url_key: 'x.com/a/status/1',
      }),
    ).rejects.toBeInstanceOf(CaptureConflictError);
    expect(calls.length).toBeGreaterThan(0);
    for (const url of calls) expect(url.searchParams.get('user_id')).toBe(`eq.${USER}`);
    expect(bodies).toEqual([expect.objectContaining({ user_id: USER, project_id: 'proj', order_index: 2, source_id: '1' })]);
  });

  it('returns only the ids the user owns, in the order asked', async () => {
    const a = '22222222-2222-4222-8222-222222222222';
    const b = '33333333-3333-4333-8333-333333333333';
    const { calls, store: s } = store(() => ok([{ id: b }]));
    expect(await s.ownedSpaceIds([a, b])).toEqual([b]);
    expect(calls[0].searchParams.get('id')).toBe(`in.(${a},${b})`);
    expect(calls[0].pathname).toBe('/rest/v1/profiles');
    expect(await s.ownedTagIds([])).toEqual([]);
  });
});

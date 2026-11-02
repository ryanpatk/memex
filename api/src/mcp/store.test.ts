import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb, userScope } from '../db';
import { createPostgrestAgentStore, itemConditions, sourceHint } from './store';

const USER = '11111111-1111-4111-8111-111111111111';
const SPACE = '33333333-3333-4333-8333-333333333333';
const ID = '44444444-4444-4444-8444-444444444444';
const AT = '2026-11-01T09:30:00.000000Z';

afterEach(() => vi.unstubAllGlobals());

describe('agent store filters', () => {
  it('turns a keyset cursor into created_at/id bounds per table', () => {
    const after = { at: AT, type: 'note' as const, id: ID };
    expect(itemConditions({ type: 'note', terms: [], from: null, to: null, after, direction: 'desc' })).toEqual([
      `or(created_at.lt."${AT}",and(created_at.eq."${AT}",id.lt.${ID}))`,
    ]);
    expect(itemConditions({ type: 'link', terms: [], from: null, to: null, after, direction: 'desc' })).toEqual([`created_at.lte."${AT}"`]);
    expect(itemConditions({ type: 'jot', terms: [], from: null, to: null, after, direction: 'asc' })).toEqual([`created_at.gte."${AT}"`]);
  });

  it('quotes search terms and requires every term', () => {
    const conds = itemConditions({ type: 'link', terms: ['kyo"to', 'trip'], from: AT, to: null, after: null, direction: 'desc' });
    expect(conds).toEqual([
      `created_at.gte."${AT}"`,
      'or(title.ilike."*kyo\\"to*",description.ilike."*kyo\\"to*",url.ilike."*kyo\\"to*")',
      'or(title.ilike."*trip*",description.ilike."*trip*",url.ilike."*trip*")',
    ]);
  });

  it('narrows platform sources and leaves web to the service', () => {
    expect(sourceHint('x')).toContain('url.ilike."*twitter.com*"');
    expect(sourceHint('web')).toBeNull();
    expect(sourceHint(null)).toBeNull();
  });

  it('scopes every read to the user and filters spaces through an inner embed', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        urls.push(new URL(input));
        return new Response('[]');
      }),
    );
    const store = createPostgrestAgentStore(userScope(createDb({ SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'k' }), USER));
    await store.listItems({ type: 'link', terms: ['a'], spaceId: SPACE, source: null, from: null, to: null, after: null, direction: 'desc', limit: 5 });
    await store.listItems({ type: 'jot', terms: [], spaceId: SPACE, source: null, from: null, to: null, after: null, direction: 'asc', limit: 5 });
    await store.getItem('note', ID);
    await store.listSpaces();
    await store.activity({ type: 'task', from: AT, to: AT, spaceId: null, limit: 5000 });
    expect(urls.every((u) => u.searchParams.get('user_id') === `eq.${USER}`)).toBe(true);
    const [links, jots] = urls;
    expect(links.searchParams.get('select')).toContain('in_space:profile_links!inner(profile_id)');
    expect(links.searchParams.get('in_space.profile_id')).toBe(`eq.${SPACE}`);
    expect(links.searchParams.get('order')).toBe('created_at.desc,id.desc');
    expect(jots.searchParams.get('profile_id')).toBe(`eq.${SPACE}`);
    expect(urls.map((u) => u.pathname.split('/').pop())).toEqual(['links', 'self_messages', 'notes', 'profiles', 'tasks']);
  });
});

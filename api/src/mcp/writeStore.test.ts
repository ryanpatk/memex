import { describe, expect, it, vi } from 'vitest';
import { createDb, userScope } from '../db';
import { createPostgrestAgentWriteStore } from './writeStore';

const USER = '11111111-1111-4111-8111-111111111111';
const NOTE = '55555555-5555-4555-8555-555555555555';

function fake(respond: (method: string, table: string, params: URLSearchParams) => Response) {
  const calls: { method: string; table: string; params: URLSearchParams; body: unknown; prefer: string | null }[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.replace('/rest/v1/', '');
    const method = init.method ?? 'GET';
    calls.push({ method, table, params: url.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined, prefer: new Headers(init.headers).get('Prefer') });
    return respond(method, table, url.searchParams);
  });
  const db = createDb({ SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'k' }, fetcher as unknown as typeof fetch);
  return { calls, store: createPostgrestAgentWriteStore(userScope(db, USER)) };
}

describe('PostgREST agent write store', () => {
  it('appends with a conditional update on updated_at, scoped to the user', async () => {
    const { calls, store } = fake(() => new Response('[]'));
    expect(await store.setNoteBody(NOTE, 'new body', '2026-11-01T10:00:00.123456+00:00')).toBe(false);
    const patch = calls[0];
    expect(patch.method).toBe('PATCH');
    expect(patch.params.get('id')).toBe(`eq.${NOTE}`);
    expect(patch.params.get('updated_at')).toBe('eq.2026-11-01T10:00:00.123456+00:00');
    expect(patch.params.get('user_id')).toBe(`eq.${USER}`);
    expect(patch.body).toEqual({ body: 'new body' });
    expect(patch.prefer).toContain('return=representation');
  });

  it('claims idempotency keys and reads the existing claim on conflict', async () => {
    const { store } = fake((method) =>
      method === 'POST'
        ? new Response(JSON.stringify({ code: '23505' }), { status: 409 })
        : new Response(JSON.stringify([{ tool: 'add_jot', fingerprint: 'abcdabcdabcdabcd', result: { id: 'x' }, created_at: 'now' }])),
    );
    const claim = await store.claimKey({ client_name: 'c', idempotency_key: 'key-0001', tool: 'add_jot', fingerprint: 'abcdabcdabcdabcd' });
    expect(claim).toEqual({ claimed: false, existing: { tool: 'add_jot', fingerprint: 'abcdabcdabcdabcd', result: { id: 'x' }, created_at: 'now' } });
  });

  it('only releases unfinished claims', async () => {
    const { calls, store } = fake(() => new Response('[]'));
    await store.releaseKey('c', 'key-0001');
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].table).toBe('agent_write_keys');
    expect(calls[0].params.get('result')).toBe('is.null');
    expect(calls[0].params.get('user_id')).toBe(`eq.${USER}`);
  });

  it('files items through the right join table, ignoring existing memberships', async () => {
    const { calls, store } = fake(() => new Response(null, { status: 201 }));
    await store.fileItem('note', NOTE, '33333333-3333-4333-8333-333333333333');
    expect(calls[0]).toMatchObject({ method: 'POST', table: 'profile_notes', body: [{ profile_id: '33333333-3333-4333-8333-333333333333', note_id: NOTE }] });
    expect(calls[0].params.get('on_conflict')).toBe('profile_id,note_id');
    expect(calls[0].prefer).toContain('ignore-duplicates');
  });

  it('reads an item with its provenance and spaces', async () => {
    const { calls, store } = fake(() =>
      new Response(JSON.stringify([{ id: NOTE, title: 'T', body: 'B', captured_by: 'agent', captured_client: 'Bot', updated_at: 'u', profile_notes: [{ profile_id: 's1' }, { profile_id: 's1' }] }])),
    );
    expect(await store.getEditable('note', NOTE)).toEqual({
      type: 'note', id: NOTE, title: 'T', text: 'B', captured_by: 'agent', captured_client: 'Bot', updated_at: 'u', space_ids: ['s1'],
    });
    expect(calls[0].params.get('user_id')).toBe(`eq.${USER}`);
  });
});

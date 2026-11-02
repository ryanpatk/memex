import { describe, expect, it, vi } from 'vitest'
import { createJotsRepository } from './jots'
import { createNotesRepository } from './notes'
import { createTasksRepository } from './tasks'
import type { MemexSupabaseClient } from './client'

/*
 * Creates with a client-chosen id (the phone's outbox): the id is inserted,
 * and if a retry hits the primary key (23505), the row already saved is
 * returned instead of an error. Offline, the auth server's own error comes
 * through (not "User not authenticated"), so the caller knows to retry.
 */

const ID = '0b4c2a8e-0000-4000-8000-000000000001'
const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint "pkey"' }

const stubClient = ({
  insert,
  existing = null,
  user = { id: 'u1' },
  authError = null,
}: {
  insert: { data: unknown; error: unknown }
  existing?: unknown
  user?: { id: string } | null
  authError?: unknown
}) => {
  const inserted: unknown[] = []
  const lookedUp: [string, unknown][] = []
  const builder = {
    insert: vi.fn((row: unknown) => {
      inserted.push(row)
      return { select: () => ({ single: async () => insert }) }
    }),
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: [{ order_index: 0 }], error: null })),
    eq: vi.fn((column: string, value: unknown) => {
      lookedUp.push([column, value])
      return { maybeSingle: async () => ({ data: existing, error: null }) }
    }),
  }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: authError })) },
    from: vi.fn(() => builder),
  } as unknown as MemexSupabaseClient
  return { client, inserted, lookedUp }
}

describe('Supabase creates with a client id', () => {
  it('jots: inserts the id; a retry returns the saved row', async () => {
    const saved = { id: ID, body: 'Tea', profile_id: null }
    const first = stubClient({ insert: { data: saved, error: null } })
    expect(await createJotsRepository(first.client).create({ id: ID, profile_id: null, body: 'Tea' })).toBe(saved)
    expect(first.inserted[0]).toMatchObject({ id: ID, user_id: 'u1', body: 'Tea' })

    const retry = stubClient({ insert: { data: null, error: duplicate }, existing: saved })
    expect(await createJotsRepository(retry.client).create({ id: ID, profile_id: null, body: 'Tea' })).toBe(saved)
    expect(retry.lookedUp).toEqual([['id', ID]])
  })

  it('without an id, nothing changes: no id is sent and a conflict is an error', async () => {
    const plain = stubClient({ insert: { data: null, error: duplicate } })
    await expect(createJotsRepository(plain.client).create({ profile_id: null, body: 'Tea' })).rejects.toMatchObject(duplicate)
    expect(plain.inserted[0]).not.toHaveProperty('id')
    expect(plain.lookedUp).toEqual([])
  })

  it('notes and tasks do the same', async () => {
    const note = { id: ID, title: 'N', body: '' }
    const notes = stubClient({ insert: { data: null, error: duplicate }, existing: note })
    expect(await createNotesRepository(notes.client).create({ id: ID, title: 'N' })).toBe(note)
    expect(notes.inserted[0]).toMatchObject({ id: ID })

    const task = { id: ID, title: 'T' }
    const tasks = stubClient({ insert: { data: null, error: duplicate }, existing: task })
    expect(await createTasksRepository(tasks.client).create({ id: ID, title: 'T' })).toBe(task)
    expect(tasks.inserted[0]).toMatchObject({ id: ID, user_id: 'u1' })
  })

  it('offline, the auth error comes through instead of “not authenticated”', async () => {
    const offline = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 }
    const { client } = stubClient({ insert: { data: null, error: null }, user: null, authError: offline })
    await expect(createJotsRepository(client).create({ profile_id: null, body: 'x' })).rejects.toBe(offline)
    const signedOut = stubClient({ insert: { data: null, error: null }, user: null })
    await expect(createJotsRepository(signedOut.client).create({ profile_id: null, body: 'x' })).rejects.toThrow('User not authenticated')
  })
})

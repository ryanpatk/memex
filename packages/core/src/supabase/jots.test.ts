import { describe, expect, it, vi } from 'vitest'
import { createJotsRepository } from './jots'
import type { MemexSupabaseClient } from './client'

/* The jots adapter's update against a stub query builder. */

const stubClient = (result: { data: unknown; error: unknown }) => {
  const calls: { table?: string; patch?: unknown; eq?: [string, unknown] } = {}
  const builder = {
    update: vi.fn((patch: unknown) => {
      calls.patch = patch
      return builder
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq = [column, value]
      return builder
    }),
    select: vi.fn(() => builder),
    single: vi.fn(async () => result),
  }
  const client = {
    from: vi.fn((table: string) => {
      calls.table = table
      return builder
    }),
  } as unknown as MemexSupabaseClient
  return { client, calls }
}

describe('createJotsRepository().update', () => {
  it('writes only the fields given, to that jot', async () => {
    const row = { id: 'j1', body: 'edited', profile_id: 's1' }
    const { client, calls } = stubClient({ data: row, error: null })
    const updated = await createJotsRepository(client).update('j1', { body: 'edited', profile_id: undefined })
    expect(calls).toEqual({ table: 'self_messages', patch: { body: 'edited' }, eq: ['id', 'j1'] })
    expect(updated).toBe(row)
  })

  it('takes a jot out of its space with null', async () => {
    const { client, calls } = stubClient({ data: { id: 'j1', profile_id: null }, error: null })
    await createJotsRepository(client).update('j1', { profile_id: null })
    expect(calls.patch).toEqual({ profile_id: null })
  })

  it('throws what the database says', async () => {
    const { client } = stubClient({ data: null, error: new Error('denied') })
    await expect(createJotsRepository(client).update('j1', { body: 'x' })).rejects.toThrow('denied')
  })
})

import { describe, expect, it } from 'vitest'
import type { MemexSupabaseClient } from './client'
import { createCountsRepository } from './counts'
import { createJotsRepository } from './jots'
import { createLinksRepository } from './links'
import { createNotesRepository } from './notes'
import { createSpaceLinksRepository } from './spaceLinks'
import { createTasksRepository } from './tasks'
import { selectAllPages } from './paging'
import { cardsCount, cardsTotal } from '../stream/cardsCount'

/*
 * A fake PostgREST that behaves like Supabase's: it returns at most `cap`
 * rows per request (max_rows), honours .range(), answers count queries, and
 * for `head: true` sends no rows. Before paging, every list stopped at the
 * cap, so a 1,400-link account showed 1,000 links and every total built from
 * the lists was wrong.
 */
const fakeClient = (tables: Record<string, Record<string, unknown>[]>, cap = 1000) => {
  const requests: { table: string; from?: number; to?: number; head?: boolean }[] = []
  const client = {
    from(table: string) {
      const rows = tables[table] ?? []
      const state: { from?: number; to?: number; count?: boolean; head?: boolean; filters: [string, unknown][] } = { filters: [] }
      const run = async () => {
        requests.push({ table, from: state.from, to: state.to, head: state.head })
        const matching = rows.filter((row) => state.filters.every(([col, value]) => row[col] === value))
        const count = state.count ? matching.length : null
        if (state.head) return { data: null, error: null, count }
        const start = state.from ?? 0
        const end = Math.min(state.to ?? Infinity, start + cap - 1)
        return { data: matching.slice(start, end + 1), error: null, count }
      }
      const builder = {
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          state.count = options?.count === 'exact'
          state.head = options?.head === true
          return builder
        },
        order: () => builder,
        eq(col: string, value: unknown) {
          state.filters.push([col, value])
          return builder
        },
        range(from: number, to: number) {
          state.from = from
          state.to = to
          return builder
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
      }
      return builder
    },
  } as unknown as MemexSupabaseClient
  return { client, requests }
}

const many = (n: number, make: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => make(i))

describe('reading every row past the row cap', () => {
  it('loads 2,345 links, not the first 1,000', async () => {
    const links = many(2345, (i) => ({ id: `l${i}` }))
    const { client, requests } = fakeClient({ links })
    const loaded = await createLinksRepository(client).getAll()
    expect(loaded).toHaveLength(2345)
    expect(new Set(loaded.map((l) => l.id)).size).toBe(2345)
    expect(requests.map((r) => r.from)).toEqual([0, 1000, 2000])
  })

  it('works when the server caps lower than a page (max_rows 300)', async () => {
    const jots = many(1001, (i) => ({ id: `j${i}` }))
    const { client } = fakeClient({ self_messages: jots }, 300)
    expect(await createJotsRepository(client).getAll()).toHaveLength(1001)
  })

  it('pages notes, tasks and space links too', async () => {
    const { client } = fakeClient({
      notes: many(1200, (i) => ({ id: `n${i}` })),
      tasks: many(1500, (i) => ({ id: `t${i}`, is_done: i % 3 === 0 })),
      profile_links: many(1100, (i) => ({ id: `pl${i}`, profile_id: 's', link_id: `l${i}` })),
    })
    expect(await createNotesRepository(client).getAll()).toHaveLength(1200)
    expect(await createTasksRepository(client).getAll()).toHaveLength(1500)
    expect(await createSpaceLinksRepository(client).listMembership()).toHaveLength(1100)
  })

  it('stops after one request for a short list, and on an empty one', async () => {
    const { client, requests } = fakeClient({ links: many(12, (i) => ({ id: `l${i}` })) })
    expect(await createLinksRepository(client).getAll()).toHaveLength(12)
    expect(requests).toHaveLength(1)
    expect(await selectAllPages(async () => ({ data: [], error: null, count: 0 }))).toEqual([])
  })

  it('passes errors on', async () => {
    await expect(selectAllPages(async () => ({ data: null, error: new Error('denied') }))).rejects.toThrow('denied')
  })
})

describe('exact counts', () => {
  it('counts every row without loading any, open tasks apart', async () => {
    const { client, requests } = fakeClient({
      links: many(1487, (i) => ({ id: `l${i}` })),
      notes: many(101, (i) => ({ id: `n${i}` })),
      tasks: many(11, (i) => ({ id: `t${i}`, is_done: i < 2 })),
      self_messages: many(1426, (i) => ({ id: `j${i}` })),
    })
    const counts = await createCountsRepository(client).get()
    expect(counts).toEqual({ links: 1487, notes: 101, tasks: 11, openTasks: 9, jots: 1426 })
    expect(requests.every((r) => r.head)).toBe(true)
    expect(cardsTotal(counts)).toBe(1487 + 101 + 9 + 1426)
  })
})

describe('the Cards count', () => {
  // Ryan's account on 2026-11-19: 487 links, 101 notes, 9 open + 2 done tasks, 426 jots.
  const counts = { links: 487, notes: 101, tasks: 11, openTasks: 9, jots: 426 }

  it('is everything Cards holds, from the exact counts, when nothing is filtered', () => {
    expect(cardsCount({ plain: true, openItems: 597, jots: 426, counts })).toBe(1023)
  })

  it('doesn’t depend on what a layout lists (the 599 vs 1,023 bug)', () => {
    // List and Table used to report their own rows: every link, note and task (done too), no jots
    const listRows = 487 + 101 + 11
    expect(listRows).toBe(599)
    // The count takes no layout at all; any layout gets the same number
    expect(cardsCount({ plain: true, openItems: 597, jots: 426, counts })).not.toBe(listRows)
    expect(cardsCount({ plain: true, openItems: 597, jots: 426 })).toBe(1023)
  })

  it('counts the matching loaded items when filtered, and falls back to them while counts load', () => {
    expect(cardsCount({ plain: false, openItems: 40, jots: 3, counts })).toBe(43)
    expect(cardsCount({ plain: true, openItems: 597, jots: 426, counts: undefined })).toBe(1023)
  })
})

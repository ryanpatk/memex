// Exact item counts (see ../repository.ts CountsRepository): count-only
// queries (`count: 'exact', head: true`) return the number of rows RLS lets
// the user see without sending any rows, so they're right past the API's
// 1,000-row cap and cheap enough to refresh after every change.
import { getErrorMessage } from '../errors'
import type { CountsRepository } from '../repository'
import type { ItemCounts } from '../types'
import type { MemexSupabaseClient } from './client'

export const createCountsRepository = (client: MemexSupabaseClient): CountsRepository => {
  const count = async (table: string, openOnly = false): Promise<number> => {
    let query = client.from(table).select('id', { count: 'exact', head: true })
    if (openOnly) query = query.eq('is_done', false)
    const { count: n, error } = await query
    if (error) {
      // A table whose migration isn't applied yet holds nothing
      const message = getErrorMessage(error)
      if (message.includes(table) && message.includes('does not exist')) return 0
      throw error
    }
    return n ?? 0
  }

  return {
    get: async (): Promise<ItemCounts> => {
      const [links, notes, tasks, openTasks, jots] = await Promise.all([
        count('links'),
        count('notes'),
        count('tasks'),
        count('tasks', true),
        count('self_messages'),
      ])
      return { links, notes, tasks, openTasks, jots }
    },
  }
}

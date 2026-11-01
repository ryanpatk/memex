// Supabase adapter (see ../repository.ts): saved Library views, table
// `saved_views` (migration 20261101200000_add_saved_views.sql).
import { getErrorMessage } from '../errors'
import type { SavedViewsRepository } from '../repository'
import type { CreateSavedViewData, SavedView, UpdateSavedViewData } from '../types'
import type { MemexSupabaseClient } from './client'

/** The table isn't there yet (migration not applied): read as no saved views. */
const isMissingTable = (error: unknown) => {
  const message = getErrorMessage(error)
  return message.includes('saved_views') && (message.includes('does not exist') || message.includes('schema cache'))
}

export const createSavedViewsRepository = (client: MemexSupabaseClient): SavedViewsRepository => ({
  getAll: async (): Promise<SavedView[]> => {
    const { data, error } = await client
      .from('saved_views')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      if (isMissingTable(error)) return []
      throw error
    }
    return data ?? []
  },

  create: async ({ name, definition, position }: CreateSavedViewData): Promise<SavedView> => {
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await client
      .from('saved_views')
      .insert({ user_id: user.id, name, definition, ...(position === undefined ? {} : { position }) })
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id: string, updates: UpdateSavedViewData): Promise<SavedView> => {
    const { data, error } = await client
      .from('saved_views')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await client.from('saved_views').delete().eq('id', id)
    if (error) throw error
  },
})

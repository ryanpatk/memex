// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage, isUniqueViolation } from '../errors'
import type { JotsRepository } from '../repository'
import type { CreateSelfMessageData, SelfMessage, UpdateSelfMessageData } from '../types'
import type { MemexSupabaseClient } from './client'
import { requireUser } from './user'


export const createJotsRepository = (client: MemexSupabaseClient): JotsRepository => {
  const selfMessagesApi = {
    /** Every message for the current user (RLS), oldest first. Scoping is
     * done client-side so Home and each space share one cached list. */
    getAll: async (): Promise<SelfMessage[]> => {
      try {
        const { data, error } = await client
          .from('self_messages')
          .select('*')
          .order('created_at', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        // Migration not applied yet — behave as an empty feed
        if (message.includes('self_messages') && message.includes('does not exist')) {
          return []
        }
        throw error
      }
    },

    create: async (input: CreateSelfMessageData): Promise<SelfMessage> => {
      const user = await requireUser(client)

      const { data, error } = await client
        .from('self_messages')
        .insert({
          ...(input.id ? { id: input.id } : {}),
          user_id: user.id,
          profile_id: input.profile_id,
          body: input.body,
        })
        .select()
        .single()

      if (error) {
        // A retried save with the id it was first sent with: it's already there.
        if (input.id && isUniqueViolation(error)) {
          const { data: existing } = await client.from('self_messages').select('*').eq('id', input.id).maybeSingle()
          if (existing) return existing
        }
        throw error
      }
      return data
    },

    update: async (id: string, updates: UpdateSelfMessageData): Promise<SelfMessage> => {
      // Only the two fields a jot lets you change; undefined ones are left alone
      const patch: UpdateSelfMessageData = {}
      if (updates.body !== undefined) patch.body = updates.body
      if (updates.profile_id !== undefined) patch.profile_id = updates.profile_id
      const { data, error } = await client
        .from('self_messages')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client.from('self_messages').delete().eq('id', id)
      if (error) throw error
    },
  }

  return {
    getAll: selfMessagesApi.getAll,
    create: selfMessagesApi.create,
    update: selfMessagesApi.update,
    delete: selfMessagesApi.delete,
  }
}

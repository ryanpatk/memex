// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { JotsRepository } from '../repository'
import type { CreateSelfMessageData, SelfMessage } from '../types'
import type { MemexSupabaseClient } from './client'


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
      const {
        data: { user },
      } = await client.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await client
        .from('self_messages')
        .insert({
          user_id: user.id,
          profile_id: input.profile_id,
          body: input.body,
        })
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
    delete: selfMessagesApi.delete,
  }
}

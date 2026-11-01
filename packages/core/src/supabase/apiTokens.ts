// Supabase adapter (see ../repository.ts). Queries moved unchanged from
// src/hooks/useApiTokens.ts on 2026-11-01.
import type { ApiTokensRepository } from '../repository'
import type { ApiToken } from '../types'
import type { MemexSupabaseClient } from './client'

export const createApiTokensRepository = (client: MemexSupabaseClient): ApiTokensRepository => ({
  getAll: async (): Promise<ApiToken[]> => {
    const { data, error } = await client
      .from('api_tokens')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  create: async ({ name, token_hash }): Promise<ApiToken> => {
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await client
      .from('api_tokens')
      .insert({ user_id: user.id, name, token_hash })
      .select()
      .single()
    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await client.from('api_tokens').delete().eq('id', id)
    if (error) throw error
  },
})

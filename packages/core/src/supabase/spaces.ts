// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { SpacesRepository } from '../repository'
import type { CreateProfileData, Profile, UpdateProfileData } from '../types'
import type { MemexSupabaseClient } from './client'


export const createSpacesRepository = (client: MemexSupabaseClient): SpacesRepository => {
  const profilesApi = {
    getAll: async (): Promise<Profile[]> => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (message.includes('profiles') && message.includes('does not exist')) {
          return []
        }
        throw error
      }
    },

    getById: async (id: string): Promise<Profile | null> => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error
        return data
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (message.includes('profiles') && message.includes('does not exist')) {
          return null
        }
        throw error
      }
    },

    create: async (profileData: CreateProfileData): Promise<Profile> => {
      const { data: { user } } = await client.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await client
        .from('profiles')
        .insert({
          ...profileData,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },

    update: async (id: string, updates: UpdateProfileData): Promise<Profile> => {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client
        .from('profiles')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
  }

  return {
    getAll: profilesApi.getAll,
    getById: profilesApi.getById,
    create: profilesApi.create,
    update: profilesApi.update,
    delete: profilesApi.delete,
  }
}

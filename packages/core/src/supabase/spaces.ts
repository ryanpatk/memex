// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { SpacesRepository } from '../repository'
import type { CreateProfileData, Profile, UpdateProfileData } from '../types'
import type { MemexSupabaseClient } from './client'
import { orderSpaces } from '../spaceOrder'


/**
 * True when a write named `profiles.color` and the database doesn't have the
 * column yet (migration 20261116120000_add_space_color.sql not applied).
 * PostgREST answers PGRST204 “Could not find the 'color' column…”.
 */
export const isMissingColorColumn = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  const code = (error as { code?: string } | null)?.code
  return /'color' column/i.test(message) || (code === 'PGRST204' && /color/i.test(message)) || (code === '42703' && /color/i.test(message))
}

/** True when a write named `position` or `hidden` and the database lacks them (PGRST204 / 42703). */
export const isMissingOrderColumns = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  const code = (error as { code?: string } | null)?.code
  return /'(position|hidden)' column/i.test(message) || ((code === 'PGRST204' || code === '42703') && /position|hidden/i.test(message))
}

/** Drops `color` from a write, for databases without the column. */
const withoutColor = <T extends { color?: string | null }>(data: T): Omit<T, 'color'> => {
  const rest = { ...data }
  delete rest.color
  return rest
}

export const createSpacesRepository = (client: MemexSupabaseClient): SpacesRepository => {
  const profilesApi = {
    getAll: async (): Promise<Profile[]> => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true })

        if (error) throw error
        // In your order (position, then created_at); colours stay by created_at
        return orderSpaces(data || [])
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

      const insert = (row: Partial<CreateProfileData>) =>
        client
          .from('profiles')
          .insert({
            ...row,
            user_id: user.id,
          })
          .select()
          .single()

      let result = await insert(profileData)
      // No colour column yet: save the space anyway, with an automatic colour
      if (result.error && profileData.color !== undefined && isMissingColorColumn(result.error)) {
        result = await insert(withoutColor(profileData))
      }
      const { data, error } = result

      if (error) throw error
      return data
    },

    update: async (id: string, updates: UpdateProfileData): Promise<Profile> => {
      const update = (row: UpdateProfileData) =>
        client
          .from('profiles')
          .update(row)
          .eq('id', id)
          .select()
          .single()

      let result = await update(updates)
      if (result.error && (updates.position !== undefined || updates.hidden !== undefined) && isMissingOrderColumns(result.error)) {
        // Space order migration (20261119120000) isn't applied: nowhere to keep it
        throw new Error('Space order needs the profiles.position and profiles.hidden columns (migration not applied yet).')
      }
      if (result.error && updates.color !== undefined && isMissingColorColumn(result.error)) {
        const rest = withoutColor(updates)
        if (Object.keys(rest).length === 0) {
          // Only a colour was asked for and there's nowhere to keep it
          throw new Error('Space colours need the profiles.color column (migration not applied yet).')
        }
        result = await update(rest)
      }
      const { data, error } = result

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

// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import type { TagsRepository } from '../repository'
import type { CreateTagData, Tag, UpdateTagData } from '../types'
import type { MemexSupabaseClient } from './client'


export const createTagsRepository = (client: MemexSupabaseClient): TagsRepository => {
  const tagsApi = {
    getAll: async (): Promise<Tag[]> => {
      const { data, error } = await client
        .from('tags')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    },

    getById: async (id: string): Promise<Tag | null> => {
      const { data, error } = await client
        .from('tags')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    },

    create: async (tagData: CreateTagData): Promise<Tag> => {
      const { data: { user } } = await client.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await client
        .from('tags')
        .insert({
          ...tagData,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },

    update: async (id: string, updates: UpdateTagData): Promise<Tag> => {
      const { data, error } = await client
        .from('tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      // First, remove the tag from all links that use it
      await client
        .from('links')
        .update({ tag_id: null })
        .eq('tag_id', id)

      // Remove from link_tags join table
      const { error: linkTagsError } = await client
        .from('link_tags')
        .delete()
        .eq('tag_id', id)

      if (linkTagsError) {
        const message =
          typeof linkTagsError.message === 'string' ? linkTagsError.message : ''
        if (!(message.includes('link_tags') && message.includes('does not exist'))) {
          throw linkTagsError
        }
      }

      // Then delete the tag
      const { error } = await client
        .from('tags')
        .delete()
        .eq('id', id)

      if (error) throw error
    },

    // Get usage count for a tag
    getUsageCount: async (tagId: string): Promise<number> => {
      const { data, error } = await client
        .from('links')
        .select('id', { count: 'exact' })
        .eq('tag_id', tagId)

      if (error) throw error
      return data?.length || 0
    },
  }

  return {
    getAll: tagsApi.getAll,
    getById: tagsApi.getById,
    create: tagsApi.create,
    update: tagsApi.update,
    delete: tagsApi.delete,
    getUsageCount: tagsApi.getUsageCount,
  }
}

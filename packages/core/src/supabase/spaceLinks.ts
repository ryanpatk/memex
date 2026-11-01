// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { SpaceLinksRepository } from '../repository'
import type { ProfileLinkMembership, ProfileLinkWithLink } from '../types'
import type { MemexSupabaseClient } from './client'


export const createSpaceLinksRepository = (client: MemexSupabaseClient): SpaceLinksRepository => {
  const profileLinksApi = {
    /** All profile ↔ link pairs for the current user (RLS). Lightweight filter + counts. */
    listMembership: async (): Promise<ProfileLinkMembership[]> => {
      try {
        const { data, error } = await client
          .from('profile_links')
          .select('profile_id, link_id, is_super_favorite')

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        // Migration for per-space super favorites not applied yet — the error
        // reads "column profile_links.is_super_favorite does not exist", so this
        // must be checked before the table-missing case. Degrade to plain
        // membership so spaces still show their contents.
        if (message.includes('is_super_favorite')) {
          const { data, error: fallbackError } = await client
            .from('profile_links')
            .select('profile_id, link_id')
          if (fallbackError) throw fallbackError
          return data || []
        }
        if (message.includes('profile_links') && message.includes('does not exist')) {
          return []
        }
        throw error
      }
    },

    /** Pin/unpin a link to the header inside one space. */
    setSuperFavorite: async (
      profileId: string,
      linkId: string,
      isSuperFavorite: boolean,
    ): Promise<void> => {
      const { error } = await client
        .from('profile_links')
        .update({ is_super_favorite: isSuperFavorite })
        .eq('profile_id', profileId)
        .eq('link_id', linkId)

      if (error) throw error
    },

    getByProfile: async (profileId: string): Promise<ProfileLinkWithLink[]> => {
      try {
        const { data, error } = await client
          .from('profile_links')
          .select(`
            *,
            link:links(
              *,
              tag:tags(*),
              link_tags:link_tags(tag:tags(*)),
              project:projects(id, name)
            )
          `)
          .eq('profile_id', profileId)
          .order('order_index', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (message.includes('profile_links') && message.includes('does not exist')) {
          return []
        }
        if (message.includes('link_tags') && message.includes('does not exist')) {
          const { data, error: fallbackError } = await client
            .from('profile_links')
            .select(`
              *,
              link:links(
                *,
                tag:tags(*),
                project:projects(id, name)
              )
            `)
            .eq('profile_id', profileId)
            .order('order_index', { ascending: true })

          if (fallbackError) throw fallbackError
          return data || []
        }
        throw error
      }
    },

    addLinks: async (profileId: string, linkIds: string[]): Promise<void> => {
      if (linkIds.length === 0) return

      const { data: existing, error: existingError } = await client
        .from('profile_links')
        .select('link_id, order_index')
        .eq('profile_id', profileId)

      if (existingError) throw existingError

      const existingIds = new Set((existing || []).map((row) => row.link_id))
      const maxOrder = (existing || []).reduce(
        (max, row) => Math.max(max, row.order_index || 0),
        0,
      )

      const uniqueNewIds = linkIds.filter((id) => !existingIds.has(id))
      if (uniqueNewIds.length === 0) return

      const inserts = uniqueNewIds.map((linkId, index) => ({
        profile_id: profileId,
        link_id: linkId,
        order_index: maxOrder + index + 1,
      }))

      const { error } = await client
        .from('profile_links')
        .insert(inserts)

      if (error) throw error
    },

    removeLink: async (profileId: string, linkId: string): Promise<void> => {
      const { error } = await client
        .from('profile_links')
        .delete()
        .eq('profile_id', profileId)
        .eq('link_id', linkId)

      if (error) throw error
    },
  }

  return {
    listMembership: profileLinksApi.listMembership,
    setSuperFavorite: profileLinksApi.setSuperFavorite,
    getBySpace: profileLinksApi.getByProfile,
    addLinks: profileLinksApi.addLinks,
    removeLink: profileLinksApi.removeLink,
  }
}

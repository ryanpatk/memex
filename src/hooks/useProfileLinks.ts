import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { ProfileLinkMembership, ProfileLinkWithLink, getErrorMessage } from '@memex/core'

export const profileLinkKeys = {
  all: ['profile-links'] as const,
  lists: () => [...profileLinkKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...profileLinkKeys.lists(), { filters }] as const,
  byProfile: (profileId: string) => [...profileLinkKeys.lists(), { profileId }] as const,
  membership: () => [...profileLinkKeys.lists(), 'membership'] as const,
}

export const profileLinksApi = {
  /** All profile ↔ link pairs for the current user (RLS). Lightweight filter + counts. */
  listMembership: async (): Promise<ProfileLinkMembership[]> => {
    try {
      const { data, error } = await supabase
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
        const { data, error: fallbackError } = await supabase
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
    const { error } = await supabase
      .from('profile_links')
      .update({ is_super_favorite: isSuperFavorite })
      .eq('profile_id', profileId)
      .eq('link_id', linkId)

    if (error) throw error
  },

  getByProfile: async (profileId: string): Promise<ProfileLinkWithLink[]> => {
    try {
      const { data, error } = await supabase
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
        const { data, error: fallbackError } = await supabase
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

    const { data: existing, error: existingError } = await supabase
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

    const { error } = await supabase
      .from('profile_links')
      .insert(inserts)

    if (error) throw error
  },

  removeLink: async (profileId: string, linkId: string): Promise<void> => {
    const { error } = await supabase
      .from('profile_links')
      .delete()
      .eq('profile_id', profileId)
      .eq('link_id', linkId)

    if (error) throw error
  },
}

export const useProfileLinks = (profileId: string) => {
  return useQuery({
    queryKey: profileLinkKeys.byProfile(profileId),
    queryFn: () => profileLinksApi.getByProfile(profileId),
    enabled: !!profileId,
  })
}

export const useProfileLinkMembership = () => {
  return useQuery({
    queryKey: profileLinkKeys.membership(),
    queryFn: () => profileLinksApi.listMembership(),
  })
}

export const useAddLinksToProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, linkIds }: { profileId: string; linkIds: string[] }) =>
      profileLinksApi.addLinks(profileId, linkIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.byProfile(variables.profileId) })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

export const useSetProfileLinkSuperFavorite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      profileId,
      linkId,
      isSuperFavorite,
    }: {
      profileId: string
      linkId: string
      isSuperFavorite: boolean
    }) => profileLinksApi.setSuperFavorite(profileId, linkId, isSuperFavorite),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: profileLinkKeys.membership() })
      const previous = queryClient.getQueryData<ProfileLinkMembership[]>(
        profileLinkKeys.membership(),
      )
      queryClient.setQueryData<ProfileLinkMembership[]>(
        profileLinkKeys.membership(),
        (rows) =>
          (rows ?? []).map((row) =>
            row.profile_id === variables.profileId && row.link_id === variables.linkId
              ? { ...row, is_super_favorite: variables.isSuperFavorite }
              : row,
          ),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileLinkKeys.membership(), context.previous)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.byProfile(variables.profileId) })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

export const useRemoveLinkFromProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, linkId }: { profileId: string; linkId: string }) =>
      profileLinksApi.removeLink(profileId, linkId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.byProfile(variables.profileId) })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

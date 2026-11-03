import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { ProfileLinkMembership } from '@memex/core'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const profileLinkKeys = {
  all: ['profile-links'] as const,
  lists: () => [...profileLinkKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...profileLinkKeys.lists(), { filters }] as const,
  byProfile: (profileId: string) => [...profileLinkKeys.lists(), { profileId }] as const,
  membership: () => [...profileLinkKeys.lists(), 'membership'] as const,
}

export const profileLinksApi = repository.spaceLinks

export const useProfileLinks = (profileId: string) => {
  return useQuery({
    queryKey: profileLinkKeys.byProfile(profileId),
    queryFn: () => profileLinksApi.getBySpace(profileId),
    enabled: !!profileId,
  })
}

export const useProfileLinkMembership = () => {
  return useQuery({
    queryKey: profileLinkKeys.membership(),
    queryFn: () => profileLinksApi.listMembership(),
  })
}

export const useAddLinksToProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, linkIds }: { profileId: string; linkIds: string[] }) =>
      profileLinksApi.addLinks(profileId, linkIds),
    // Settled: a failed add refetches too (see useAddTasksToProfile)
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.byProfile(variables.profileId) })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

export const useSetProfileLinkSuperFavorite = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
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

export const useRemoveLinkFromProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, linkId }: { profileId: string; linkId: string }) =>
      profileLinksApi.removeLink(profileId, linkId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.byProfile(variables.profileId) })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

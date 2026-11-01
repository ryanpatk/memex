import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { UpdateProfileData } from '@memex/core'
import { profileLinkKeys } from './useProfileLinks'

export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...profileKeys.lists(), { filters }] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileKeys.details(), id] as const,
}

export const profilesApi = repository.spaces

export const useProfiles = () => {
  return useQuery({
    queryKey: profileKeys.lists(),
    queryFn: profilesApi.getAll,
  })
}

export const useProfile = (id: string) => {
  return useQuery({
    queryKey: profileKeys.detail(id),
    queryFn: () => profilesApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: profilesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() })
    },
  })
}

export const useUpdateProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateProfileData }) =>
      profilesApi.update(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() })
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(data.id) })
    },
  })
}

export const useDeleteProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: profilesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() })
      queryClient.invalidateQueries({ queryKey: profileLinkKeys.membership() })
    },
  })
}

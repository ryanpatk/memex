import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { Profile, CreateProfileData, UpdateProfileData, getErrorMessage } from '@memex/core'
import { profileLinkKeys } from './useProfileLinks'

export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...profileKeys.lists(), { filters }] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileKeys.details(), id] as const,
}

export const profilesApi = {
  getAll: async (): Promise<Profile[]> => {
    try {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)

    if (error) throw error
  },
}

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

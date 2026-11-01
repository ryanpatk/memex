import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { Tag, CreateTagData, UpdateTagData } from '@memex/core'

// Query keys
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...tagKeys.lists(), { filters }] as const,
  details: () => [...tagKeys.all, 'detail'] as const,
  detail: (id: string) => [...tagKeys.details(), id] as const,
}

// Predefined tag colors aligned to the operator palette
export const TAG_COLORS = [
  '#0328F1',
  '#2545FF',
  '#FB4010',
  '#FF7C2B',
  '#F6F91E',
  '#C9CC27',
  '#1A2438',
  '#586883',
  '#8EA0BC',
  '#D8E2F2',
]

// Tags API functions
export const tagsApi = {
  getAll: async (): Promise<Tag[]> => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<Tag | null> => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  create: async (tagData: CreateTagData): Promise<Tag> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    await supabase
      .from('links')
      .update({ tag_id: null })
      .eq('tag_id', id)

    // Remove from link_tags join table
    const { error: linkTagsError } = await supabase
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
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Get usage count for a tag
  getUsageCount: async (tagId: string): Promise<number> => {
    const { data, error } = await supabase
      .from('links')
      .select('id', { count: 'exact' })
      .eq('tag_id', tagId)

    if (error) throw error
    return data?.length || 0
  },
}

// Custom hooks
export const useTags = () => {
  return useQuery({
    queryKey: tagKeys.lists(),
    queryFn: tagsApi.getAll,
  })
}

export const useTag = (id: string) => {
  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: () => tagsApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tagsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

export const useUpdateTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTagData }) =>
      tagsApi.update(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(data.id) })
      // Also invalidate links that might use this tag
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
  })
}

export const useDeleteTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tagsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
      // Also invalidate links since some might have had their tag_id cleared
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
  })
}

export const useTagUsageCount = (tagId: string) => {
  return useQuery({
    queryKey: [...tagKeys.detail(tagId), 'usage'],
    queryFn: () => tagsApi.getUsageCount(tagId),
    enabled: !!tagId,
  })
}

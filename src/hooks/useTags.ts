import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { UpdateTagData } from '@memex/core'

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
export const tagsApi = repository.tags

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

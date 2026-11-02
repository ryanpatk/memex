import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SavedView, UpdateSavedViewData } from '@memex/core'
import { repository } from '../data/repository'

/** Saved Library views (decision 15A, docs/library-views.md). */
export const savedViewKeys = {
  all: ['saved-views'] as const,
  list: () => [...savedViewKeys.all, 'list'] as const,
}

export const savedViewsApi = repository.views

export const useSavedViews = () =>
  useQuery({
    queryKey: savedViewKeys.list(),
    queryFn: savedViewsApi.getAll,
  })

export const useCreateSavedView = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: savedViewsApi.create,
    onSuccess: (created) => {
      queryClient.setQueryData<SavedView[]>(savedViewKeys.list(), (prev) => [...(prev ?? []), created])
      void queryClient.invalidateQueries({ queryKey: savedViewKeys.list() })
    },
  })
}

export const useUpdateSavedView = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateSavedViewData }) => savedViewsApi.update(id, updates),
    // Rename and update show at once; the server copy replaces it
    onMutate: ({ id, updates }) => {
      const previous = queryClient.getQueryData<SavedView[]>(savedViewKeys.list())
      queryClient.setQueryData<SavedView[]>(savedViewKeys.list(), (prev) =>
        (prev ?? []).map((view) => (view.id === id ? { ...view, ...updates } : view)),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(savedViewKeys.list(), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: savedViewKeys.list() })
    },
  })
}

export const useDeleteSavedView = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: savedViewsApi.delete,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<SavedView[]>(savedViewKeys.list(), (prev) => (prev ?? []).filter((view) => view.id !== id))
      void queryClient.invalidateQueries({ queryKey: savedViewKeys.list() })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { repository } from '../data/repository'
import type { SelfMessage, UpdateSelfMessageData } from '@memex/core'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const selfMessageKeys = {
  all: ['self-messages'] as const,
  list: () => [...selfMessageKeys.all, 'list'] as const,
}

export const selfMessagesApi = repository.jots

export const useAllSelfMessages = () =>
  useQuery({
    queryKey: selfMessageKeys.list(),
    queryFn: selfMessagesApi.getAll,
  })

/** Messages for one scope: a space id, or null for the Home (general) feed. */
export const useSelfMessages = (profileId: string | null) => {
  const query = useAllSelfMessages()
  const messages = useMemo(
    () => (query.data ?? []).filter((m) => (m.profile_id ?? null) === profileId),
    [profileId, query.data],
  )
  return { ...query, messages }
}

export const useCreateSelfMessage = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: selfMessagesApi.create,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: selfMessageKeys.list() })
      const previous = queryClient.getQueryData<SelfMessage[]>(selfMessageKeys.list())
      const now = new Date().toISOString()
      const optimistic: SelfMessage = {
        id: `temp-${Date.now()}`,
        user_id: '',
        profile_id: input.profile_id,
        body: input.body,
        created_at: now,
        updated_at: now,
      }
      queryClient.setQueryData<SelfMessage[]>(selfMessageKeys.list(), (rows) => [
        ...(rows ?? []),
        optimistic,
      ])
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(selfMessageKeys.list(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: selfMessageKeys.list() })
    },
  })
}

export const useDeleteSelfMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: selfMessagesApi.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: selfMessageKeys.list() })
      const previous = queryClient.getQueryData<SelfMessage[]>(selfMessageKeys.list())
      queryClient.setQueryData<SelfMessage[]>(selfMessageKeys.list(), (rows) =>
        (rows ?? []).filter((m) => m.id !== id),
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(selfMessageKeys.list(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: selfMessageKeys.list() })
    },
  })
}

/**
 * Edit a jot or move it (`profile_id`: a space, or null for the Journal).
 * Optimistic: the feed shows the change at once and rolls back on failure.
 */
export const useUpdateSelfMessage = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ id, updates }: { id: string; updates: UpdateSelfMessageData }) =>
      selfMessagesApi.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: selfMessageKeys.list() })
      const previous = queryClient.getQueryData<SelfMessage[]>(selfMessageKeys.list())
      queryClient.setQueryData<SelfMessage[]>(selfMessageKeys.list(), (rows) =>
        (rows ?? []).map((m) => (m.id === id ? { ...m, ...updates } : m)),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(selfMessageKeys.list(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: selfMessageKeys.list() })
    },
  })
}

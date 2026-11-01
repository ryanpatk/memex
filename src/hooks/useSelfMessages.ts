import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import supabase from '../supabase'
import { CreateSelfMessageData, SelfMessage, getErrorMessage } from '@memex/core'

export const selfMessageKeys = {
  all: ['self-messages'] as const,
  list: () => [...selfMessageKeys.all, 'list'] as const,
}

export const selfMessagesApi = {
  /** Every message for the current user (RLS), oldest first. Scoping is
   * done client-side so Home and each space share one cached list. */
  getAll: async (): Promise<SelfMessage[]> => {
    try {
      const { data, error } = await supabase
        .from('self_messages')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error: unknown) {
      const message = getErrorMessage(error)
      // Migration not applied yet — behave as an empty feed
      if (message.includes('self_messages') && message.includes('does not exist')) {
        return []
      }
      throw error
    }
  },

  create: async (input: CreateSelfMessageData): Promise<SelfMessage> => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('self_messages')
      .insert({
        user_id: user.id,
        profile_id: input.profile_id,
        body: input.body,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('self_messages').delete().eq('id', id)
    if (error) throw error
  },
}

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

export const useCreateSelfMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { Note, NoteWithTags, CreateNoteData, UpdateNoteData, getErrorMessage } from '@memex/core'

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
}

const isMissingRelationError = (error: unknown, relation: string) => {
  const message = getErrorMessage(error)
  return message.includes(relation) && message.includes('does not exist')
}

export const notesApi = {
  getAll: async (): Promise<NoteWithTags[]> => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select(`
          *,
          note_tags:note_tags(tag:tags(*))
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error: unknown) {
      // Graceful degradation while the notes migration hasn't been applied
      if (isMissingRelationError(error, 'notes')) {
        return []
      }
      if (isMissingRelationError(error, 'note_tags')) {
        const { data, error: fallbackError } = await supabase
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false })

        if (fallbackError) throw fallbackError
        return data || []
      }
      throw error
    }
  },

  create: async (noteData: CreateNoteData): Promise<Note> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('notes')
      .insert({
        title: noteData.title,
        body: noteData.body ?? '',
        order_index: noteData.order_index ?? 0,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, updates: UpdateNoteData): Promise<Note> => {
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)

    if (error) throw error
  },
}

export const useAllNotes = () => {
  return useQuery({
    queryKey: noteKeys.lists(),
    queryFn: notesApi.getAll,
  })
}

export const useCreateNote = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteData: CreateNoteData) => notesApi.create(noteData),
    onMutate: async (noteData) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const optimisticNote: NoteWithTags = {
        id: `temp-${Date.now()}`,
        user_id: '',
        title: noteData.title,
        body: noteData.body ?? '',
        order_index: noteData.order_index ?? 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      }

      queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) => [
        optimisticNote,
        ...old,
      ])

      return { optimisticNote }
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) => {
        const index = old.findIndex((note) => note.id === context?.optimisticNote.id)
        if (index >= 0) {
          const next = [...old]
          next[index] = { ...data, tags: [] }
          return next
        }
        return [{ ...data, tags: [] }, ...old]
      })
    },
    onError: (_err, _variables, context) => {
      if (context?.optimisticNote) {
        queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) =>
          old.filter((note) => note.id !== context.optimisticNote.id),
        )
      }
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

export const useUpdateNote = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateNoteData }) =>
      notesApi.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const previous = queryClient.getQueryData<NoteWithTags[]>(noteKeys.lists())

      queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) =>
        old.map((note) =>
          note.id === id
            ? {
                ...note,
                ...updates,
                title: updates.title === null ? undefined : updates.title ?? note.title,
                updated_at: new Date().toISOString(),
              }
            : note,
        ),
      )

      return { previous }
    },
    onSuccess: (data) => {
      // Keep the server row (authoritative updated_at) without refetching
      queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) =>
        old.map((note) =>
          note.id === data.id ? { ...note, ...data } : note,
        ),
      )
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(noteKeys.lists(), context.previous)
      }
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

export const useDeleteNote = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: notesApi.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })
      const previous = queryClient.getQueryData<NoteWithTags[]>(noteKeys.lists())
      queryClient.setQueryData<NoteWithTags[]>(noteKeys.lists(), (old = []) =>
        old.filter((note) => note.id !== id),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(noteKeys.lists(), context.previous)
      }
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

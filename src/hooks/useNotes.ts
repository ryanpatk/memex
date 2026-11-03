import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { NoteWithTags, CreateNoteData, UpdateNoteData } from '@memex/core'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
}

export const notesApi = repository.notes

export const useAllNotes = () => {
  return useQuery({
    queryKey: noteKeys.lists(),
    queryFn: notesApi.getAll,
  })
}

export const useCreateNote = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
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

export const useUpdateNote = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
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

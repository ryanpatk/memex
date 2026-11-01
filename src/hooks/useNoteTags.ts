import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { noteKeys } from './useNotes'

export const noteTagsApi = { setForNote: repository.notes.setTags }

export const useSetNoteTags = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, tagIds }: { noteId: string; tagIds: string[] }) =>
      noteTagsApi.setForNote(noteId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

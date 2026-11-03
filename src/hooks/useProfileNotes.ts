import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const profileNoteKeys = {
  all: ['profile-notes'] as const,
  lists: () => [...profileNoteKeys.all, 'list'] as const,
  membership: () => [...profileNoteKeys.lists(), 'membership'] as const,
}

export const profileNotesApi = repository.spaceNotes

export const useProfileNoteMembership = () => {
  return useQuery({
    queryKey: profileNoteKeys.membership(),
    queryFn: () => profileNotesApi.listMembership(),
  })
}

export const useAddNotesToProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, noteIds }: { profileId: string; noteIds: string[] }) =>
      profileNotesApi.addNotes(profileId, noteIds),
    // Settled: a failed add refetches too (see useAddTasksToProfile)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileNoteKeys.membership() })
    },
  })
}

export const useRemoveNoteFromProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, noteId }: { profileId: string; noteId: string }) =>
      profileNotesApi.removeNote(profileId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileNoteKeys.membership() })
    },
  })
}

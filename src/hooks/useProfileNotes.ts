import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'

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

export const useAddNotesToProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, noteIds }: { profileId: string; noteIds: string[] }) =>
      profileNotesApi.addNotes(profileId, noteIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileNoteKeys.membership() })
    },
  })
}

export const useRemoveNoteFromProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, noteId }: { profileId: string; noteId: string }) =>
      profileNotesApi.removeNote(profileId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileNoteKeys.membership() })
    },
  })
}

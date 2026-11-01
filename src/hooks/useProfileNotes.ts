import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { getErrorMessage } from '@memex/core'

export const profileNoteKeys = {
  all: ['profile-notes'] as const,
  lists: () => [...profileNoteKeys.all, 'list'] as const,
  membership: () => [...profileNoteKeys.lists(), 'membership'] as const,
}

export const profileNotesApi = {
  /** All profile ↔ note pairs for the current user (RLS). Lightweight filter + counts. */
  listMembership: async (): Promise<{ profile_id: string; note_id: string }[]> => {
    try {
      const { data, error } = await supabase
        .from('profile_notes')
        .select('profile_id, note_id')

      if (error) throw error
      return data || []
    } catch (error: unknown) {
      const message = getErrorMessage(error)
      if (message.includes('profile_notes') && message.includes('does not exist')) {
        return []
      }
      throw error
    }
  },

  addNotes: async (profileId: string, noteIds: string[]): Promise<void> => {
    if (noteIds.length === 0) return

    const { data: existing, error: existingError } = await supabase
      .from('profile_notes')
      .select('note_id, order_index')
      .eq('profile_id', profileId)

    if (existingError) throw existingError

    const existingIds = new Set((existing || []).map((row) => row.note_id))
    const maxOrder = (existing || []).reduce(
      (max, row) => Math.max(max, row.order_index || 0),
      0,
    )

    const uniqueNewIds = noteIds.filter((id) => !existingIds.has(id))
    if (uniqueNewIds.length === 0) return

    const inserts = uniqueNewIds.map((noteId, index) => ({
      profile_id: profileId,
      note_id: noteId,
      order_index: maxOrder + index + 1,
    }))

    const { error } = await supabase
      .from('profile_notes')
      .insert(inserts)

    if (error) throw error
  },

  removeNote: async (profileId: string, noteId: string): Promise<void> => {
    const { error } = await supabase
      .from('profile_notes')
      .delete()
      .eq('profile_id', profileId)
      .eq('note_id', noteId)

    if (error) throw error
  },
}

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

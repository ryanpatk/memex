// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { SpaceNotesRepository } from '../repository'
import type { MemexSupabaseClient } from './client'


export const createSpaceNotesRepository = (client: MemexSupabaseClient): SpaceNotesRepository => {
  const profileNotesApi = {
    /** All profile ↔ note pairs for the current user (RLS). Lightweight filter + counts. */
    listMembership: async (): Promise<{ profile_id: string; note_id: string }[]> => {
      try {
        const { data, error } = await client
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

      const { data: existing, error: existingError } = await client
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

      const { error } = await client
        .from('profile_notes')
        .insert(inserts)

      if (error) throw error
    },

    removeNote: async (profileId: string, noteId: string): Promise<void> => {
      const { error } = await client
        .from('profile_notes')
        .delete()
        .eq('profile_id', profileId)
        .eq('note_id', noteId)

      if (error) throw error
    },
  }

  return {
    listMembership: profileNotesApi.listMembership,
    addNotes: profileNotesApi.addNotes,
    removeNote: profileNotesApi.removeNote,
  }
}

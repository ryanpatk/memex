// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage, isUniqueViolation } from '../errors'
import type { NotesRepository } from '../repository'
import type { CreateNoteData, Note, NoteWithTags, UpdateNoteData } from '../types'
import type { MemexSupabaseClient } from './client'
import { requireUser } from './user'

const isMissingRelationError = (error: unknown, relation: string) => {
  const message = getErrorMessage(error)
  return message.includes(relation) && message.includes('does not exist')
}

export const createNotesRepository = (client: MemexSupabaseClient): NotesRepository => {
  const notesApi = {
    getAll: async (): Promise<NoteWithTags[]> => {
      try {
        const { data, error } = await client
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
          const { data, error: fallbackError } = await client
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
      const user = await requireUser(client)

      const { data, error } = await client
        .from('notes')
        .insert({
          ...(noteData.id ? { id: noteData.id } : {}),
          title: noteData.title,
          body: noteData.body ?? '',
          order_index: noteData.order_index ?? 0,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) {
        // A retried save with the id it was first sent with: it's already there.
        if (noteData.id && isUniqueViolation(error)) {
          const { data: existing } = await client.from('notes').select('*').eq('id', noteData.id).maybeSingle()
          if (existing) return existing
        }
        throw error
      }
      return data
    },

    update: async (id: string, updates: UpdateNoteData): Promise<Note> => {
      const { data, error } = await client
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client
        .from('notes')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
  }

  const noteTagsApi = {
    setForNote: async (noteId: string, tagIds: string[]): Promise<void> => {
      const { error: deleteError } = await client
        .from('note_tags')
        .delete()
        .eq('note_id', noteId)

      if (deleteError) throw deleteError

      if (tagIds.length > 0) {
        const inserts = tagIds.map((tagId) => ({
          note_id: noteId,
          tag_id: tagId,
        }))

        const { error: insertError } = await client
          .from('note_tags')
          .insert(inserts)

        if (insertError) throw insertError
      }
    },
  }

  return {
    getAll: notesApi.getAll,
    create: notesApi.create,
    update: notesApi.update,
    delete: notesApi.delete,
    setTags: noteTagsApi.setForNote,
  }
}

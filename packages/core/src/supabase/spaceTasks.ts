// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { SpaceTasksRepository } from '../repository'
import type { MemexSupabaseClient } from './client'


export const createSpaceTasksRepository = (client: MemexSupabaseClient): SpaceTasksRepository => {
  const profileTasksApi = {
    /** All profile ↔ task pairs for the current user (RLS). Lightweight filter + counts. */
    listMembership: async (): Promise<{ profile_id: string; task_id: string }[]> => {
      try {
        const { data, error } = await client
          .from('profile_tasks')
          .select('profile_id, task_id')

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (message.includes('profile_tasks') && message.includes('does not exist')) {
          return []
        }
        throw error
      }
    },

    addTasks: async (profileId: string, taskIds: string[]): Promise<void> => {
      if (taskIds.length === 0) return

      const { data: existing, error: existingError } = await client
        .from('profile_tasks')
        .select('task_id, order_index')
        .eq('profile_id', profileId)

      if (existingError) throw existingError

      const existingIds = new Set((existing || []).map((row) => row.task_id))
      const maxOrder = (existing || []).reduce(
        (max, row) => Math.max(max, row.order_index || 0),
        0,
      )

      const uniqueNewIds = taskIds.filter((id) => !existingIds.has(id))
      if (uniqueNewIds.length === 0) return

      const inserts = uniqueNewIds.map((taskId, index) => ({
        profile_id: profileId,
        task_id: taskId,
        order_index: maxOrder + index + 1,
      }))

      const { error } = await client
        .from('profile_tasks')
        .insert(inserts)

      if (error) throw error
    },

    removeTask: async (profileId: string, taskId: string): Promise<void> => {
      const { error } = await client
        .from('profile_tasks')
        .delete()
        .eq('profile_id', profileId)
        .eq('task_id', taskId)

      if (error) throw error
    },
  }

  return {
    listMembership: profileTasksApi.listMembership,
    addTasks: profileTasksApi.addTasks,
    removeTask: profileTasksApi.removeTask,
  }
}

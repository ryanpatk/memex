import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { getErrorMessage } from '@memex/core'

export const profileTaskKeys = {
  all: ['profile-tasks'] as const,
  lists: () => [...profileTaskKeys.all, 'list'] as const,
  membership: () => [...profileTaskKeys.lists(), 'membership'] as const,
}

export const profileTasksApi = {
  /** All profile ↔ task pairs for the current user (RLS). Lightweight filter + counts. */
  listMembership: async (): Promise<{ profile_id: string; task_id: string }[]> => {
    try {
      const { data, error } = await supabase
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

    const { data: existing, error: existingError } = await supabase
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

    const { error } = await supabase
      .from('profile_tasks')
      .insert(inserts)

    if (error) throw error
  },

  removeTask: async (profileId: string, taskId: string): Promise<void> => {
    const { error } = await supabase
      .from('profile_tasks')
      .delete()
      .eq('profile_id', profileId)
      .eq('task_id', taskId)

    if (error) throw error
  },
}

export const useProfileTaskMembership = () => {
  return useQuery({
    queryKey: profileTaskKeys.membership(),
    queryFn: () => profileTasksApi.listMembership(),
  })
}

export const useAddTasksToProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, taskIds }: { profileId: string; taskIds: string[] }) =>
      profileTasksApi.addTasks(profileId, taskIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileTaskKeys.membership() })
    },
  })
}

export const useRemoveTaskFromProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ profileId, taskId }: { profileId: string; taskId: string }) =>
      profileTasksApi.removeTask(profileId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileTaskKeys.membership() })
    },
  })
}

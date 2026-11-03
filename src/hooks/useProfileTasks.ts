import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const profileTaskKeys = {
  all: ['profile-tasks'] as const,
  lists: () => [...profileTaskKeys.all, 'list'] as const,
  membership: () => [...profileTaskKeys.lists(), 'membership'] as const,
}

export const profileTasksApi = repository.spaceTasks

export const useProfileTaskMembership = () => {
  return useQuery({
    queryKey: profileTaskKeys.membership(),
    queryFn: () => profileTasksApi.listMembership(),
  })
}

export const useAddTasksToProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, taskIds }: { profileId: string; taskIds: string[] }) =>
      profileTasksApi.addTasks(profileId, taskIds),
    // Settled, not success: a failed add also refetches, dropping any row a
    // caller wrote into the membership cache ahead of the write (TasksPage)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileTaskKeys.membership() })
    },
  })
}

export const useRemoveTaskFromProfile = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ profileId, taskId }: { profileId: string; taskId: string }) =>
      profileTasksApi.removeTask(profileId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileTaskKeys.membership() })
    },
  })
}

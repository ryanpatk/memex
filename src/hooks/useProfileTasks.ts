import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'

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

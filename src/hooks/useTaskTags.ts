import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { taskKeys } from './useTasks'

export const taskTagsApi = { setForTask: repository.tasks.setTags }

export const useSetTaskTags = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, tagIds }: { taskId: string; tagIds: string[] }) =>
      taskTagsApi.setForTask(taskId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { taskKeys } from './useTasks'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const taskTagsApi = { setForTask: repository.tasks.setTags }

export const useSetTaskTags = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ taskId, tagIds }: { taskId: string; tagIds: string[] }) =>
      taskTagsApi.setForTask(taskId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

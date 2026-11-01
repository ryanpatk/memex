import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { TaskWithTags, CreateTaskData, UpdateTaskData } from '@memex/core'

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
}

export const tasksApi = repository.tasks

export const useAllTasks = () => {
  return useQuery({
    queryKey: taskKeys.lists(),
    queryFn: tasksApi.getAll,
  })
}

export const useCreateTask = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskData: CreateTaskData) => tasksApi.create(taskData),
    onMutate: async (taskData) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })

      let minOrder = 1
      for (const task of queryClient.getQueryData<TaskWithTags[]>(taskKeys.lists()) ?? []) {
        if (task.order_index != null) {
          minOrder = Math.min(minOrder, task.order_index)
        }
      }

      const optimisticTask: TaskWithTags = {
        id: `temp-${Date.now()}`,
        user_id: '',
        title: taskData.title,
        detail: taskData.detail,
        is_done: false,
        due_date: taskData.due_date,
        order_index: taskData.order_index ?? minOrder - 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      }

      queryClient.setQueryData<TaskWithTags[]>(taskKeys.lists(), (old = []) => [
        optimisticTask,
        ...old,
      ])

      return { optimisticTask }
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData<TaskWithTags[]>(taskKeys.lists(), (old = []) => {
        const index = old.findIndex((task) => task.id === context?.optimisticTask.id)
        if (index >= 0) {
          const next = [...old]
          next[index] = { ...data, tags: [] }
          return next
        }
        return [{ ...data, tags: [] }, ...old]
      })
    },
    onError: (_err, _variables, context) => {
      if (context?.optimisticTask) {
        queryClient.setQueryData<TaskWithTags[]>(taskKeys.lists(), (old = []) =>
          old.filter((task) => task.id !== context.optimisticTask.id),
        )
      }
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTaskData }) =>
      tasksApi.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })

      const previous = queryClient.getQueryData<TaskWithTags[]>(taskKeys.lists())

      queryClient.setQueryData<TaskWithTags[]>(taskKeys.lists(), (old = []) =>
        old.map((task) =>
          task.id === id ? { ...task, ...updates, due_date: updates.due_date ?? task.due_date ?? undefined } : task,
        ),
      )

      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.lists(), context.previous)
      }
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tasksApi.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })
      const previous = queryClient.getQueryData<TaskWithTags[]>(taskKeys.lists())
      queryClient.setQueryData<TaskWithTags[]>(taskKeys.lists(), (old = []) =>
        old.filter((task) => task.id !== id),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.lists(), context.previous)
      }
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { Task, TaskWithTags, CreateTaskData, UpdateTaskData, getErrorMessage } from '@memex/core'

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
}

const isMissingRelationError = (error: unknown, relation: string) => {
  const message = getErrorMessage(error)
  return message.includes(relation) && message.includes('does not exist')
}

export const tasksApi = {
  getAll: async (): Promise<TaskWithTags[]> => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          task_tags:task_tags(tag:tags(*))
        `)
        .order('order_index', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error: unknown) {
      // Graceful degradation while the tasks migration hasn't been applied
      if (isMissingRelationError(error, 'tasks')) {
        return []
      }
      if (isMissingRelationError(error, 'task_tags')) {
        const { data, error: fallbackError } = await supabase
          .from('tasks')
          .select('*')
          .order('order_index', { ascending: true })

        if (fallbackError) throw fallbackError
        return data || []
      }
      throw error
    }
  },

  create: async (taskData: CreateTaskData): Promise<Task> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // Place new tasks at the top of the order stack.
    const { data: existing } = await supabase
      .from('tasks')
      .select('order_index')
      .order('order_index', { ascending: true })
      .limit(1)

    const minOrder = existing?.[0]?.order_index ?? 1

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...taskData,
        user_id: user.id,
        order_index: taskData.order_index ?? minOrder - 1,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, updates: UpdateTaskData): Promise<Task> => {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) throw error
  },
}

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

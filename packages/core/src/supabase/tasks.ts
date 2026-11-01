// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { TasksRepository } from '../repository'
import type { CreateTaskData, Task, TaskWithTags, UpdateTaskData } from '../types'
import type { MemexSupabaseClient } from './client'

const isMissingRelationError = (error: unknown, relation: string) => {
  const message = getErrorMessage(error)
  return message.includes(relation) && message.includes('does not exist')
}

export const createTasksRepository = (client: MemexSupabaseClient): TasksRepository => {
  const tasksApi = {
    getAll: async (): Promise<TaskWithTags[]> => {
      try {
        const { data, error } = await client
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
          const { data, error: fallbackError } = await client
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
      const { data: { user } } = await client.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Place new tasks at the top of the order stack.
      const { data: existing } = await client
        .from('tasks')
        .select('order_index')
        .order('order_index', { ascending: true })
        .limit(1)

      const minOrder = existing?.[0]?.order_index ?? 1

      const { data, error } = await client
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
      const { data, error } = await client
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
  }

  const taskTagsApi = {
    setForTask: async (taskId: string, tagIds: string[]): Promise<void> => {
      const { error: deleteError } = await client
        .from('task_tags')
        .delete()
        .eq('task_id', taskId)

      if (deleteError) throw deleteError

      if (tagIds.length > 0) {
        const inserts = tagIds.map((tagId) => ({
          task_id: taskId,
          tag_id: tagId,
        }))

        const { error: insertError } = await client
          .from('task_tags')
          .insert(inserts)

        if (insertError) throw insertError
      }
    },
  }

  return {
    getAll: tasksApi.getAll,
    create: tasksApi.create,
    update: tasksApi.update,
    delete: tasksApi.delete,
    setTags: taskTagsApi.setForTask,
  }
}

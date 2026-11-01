// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import type { ProjectsRepository } from '../repository'
import type { CreateProjectData, Project, ProjectWithCounts, UpdateProjectData } from '../types'
import type { MemexSupabaseClient } from './client'


export const createProjectsRepository = (client: MemexSupabaseClient): ProjectsRepository => {
  const projectsApi = {
    getAll: async (): Promise<ProjectWithCounts[]> => {
      const { data, error } = await client
        .from('projects')
        .select(`
          *,
          links(count)
        `)
        .order('is_starred', { ascending: false })
        .order('last_modified', { ascending: false })
      
      if (error) throw error
      return data || []
    },

    getById: async (id: string): Promise<Project | null> => {
      const { data, error } = await client
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    },

    create: async (projectData: CreateProjectData): Promise<Project> => {
      const { data: { user } } = await client.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await client
        .from('projects')
        .insert({
          ...projectData,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },

    update: async (id: string, updates: UpdateProjectData): Promise<Project> => {
      const { data, error } = await client
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client
        .from('projects')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
  }

  return {
    getAll: projectsApi.getAll,
    getById: projectsApi.getById,
    create: projectsApi.create,
    update: projectsApi.update,
    delete: projectsApi.delete,
  }
}

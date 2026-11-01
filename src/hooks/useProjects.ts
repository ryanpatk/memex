import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { useAppStore } from '../store'
import { Project, ProjectWithCounts, CreateProjectData, UpdateProjectData } from '@memex/core'

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
}

// Projects API functions
export const projectsApi = {
  getAll: async (): Promise<ProjectWithCounts[]> => {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  create: async (projectData: CreateProjectData): Promise<Project> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error
  },
}

// Custom hooks
export const useProjects = () => {
  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: projectsApi.getAll,
  })
}

export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      // Store will be updated automatically via useProjects hook
    },
  })
}

export const useUpdateProject = () => {
  const queryClient = useQueryClient()
  const updateProject = useAppStore(state => state.updateProject)

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateProjectData }) =>
      projectsApi.update(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.id) })
      updateProject(data.id, data)
    },
  })
}

export const useDeleteProject = () => {
  const queryClient = useQueryClient()
  const removeProject = useAppStore(state => state.removeProject)

  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      removeProject(id)
    },
  })
}
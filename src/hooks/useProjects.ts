import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { useAppStore } from '../store'
import { UpdateProjectData } from '@memex/core'

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
}

// Projects API functions
export const projectsApi = repository.projects

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
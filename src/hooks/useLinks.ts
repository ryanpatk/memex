import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { useAppStore } from '../store'
import {
  Link,
  LinkWithTag,
  CreateLinkData,
  UpdateLinkData,
  getUrlTitle,
  WEB_CLIENT,
  withAppProvenance,
} from '@memex/core'
import { urlScraperApi } from './useUrlScraper'

// Query keys
export const linkKeys = {
  all: ['links'] as const,
  lists: () => [...linkKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...linkKeys.lists(), { filters }] as const,
  details: () => [...linkKeys.all, 'detail'] as const,
  detail: (id: string) => [...linkKeys.details(), id] as const,
  byProject: (projectId: string) => [...linkKeys.lists(), { projectId }] as const,
}

// Links API functions
// Links data access (the Repository) plus URL-derived metadata for capture
export const linksApi = {
  ...repository.links,

  // Utility function to extract metadata from URL (basic implementation)
  extractMetadata: async (url: string): Promise<Partial<Pick<Link, 'title' | 'description' | 'favicon_url'>>> => {
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.replace('www.', '')

      return {
        title: getUrlTitle(url),
        favicon_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      }
    } catch {
      return {
        title: url,
      }
    }
  },
}

// Custom hooks
export const useProjectLinks = (projectId: string) => {
  return useQuery({
    queryKey: linkKeys.byProject(projectId),
    queryFn: () => linksApi.getByProject(projectId),
    enabled: !!projectId,
  })
}

export const useAllLinks = () => {
  return useQuery({
    queryKey: linkKeys.lists(),
    queryFn: linksApi.getAll,
  })
}

export const useProjectsLinks = (projectIds: string[]) => {
  return useQuery({
    queryKey: [...linkKeys.lists(), { projectIds }],
    queryFn: () => linksApi.getByProjects(projectIds),
  })
}

export const useLink = (id: string) => {
  return useQuery({
    queryKey: linkKeys.detail(id),
    queryFn: () => linksApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateLink = () => {
  const queryClient = useQueryClient()
  const addLink = useAppStore(state => state.addLink)

  return useMutation({
    mutationFn: async (input: CreateLinkData) => {
      // Saved in the web app: captured_by 'app', like the phone's saves
      const linkData = withAppProvenance(input, WEB_CLIENT)
      // Fill missing metadata: real page metadata from the scraper worker when
      // available, URL-derived fallbacks otherwise. Stored once at capture so
      // display never needs live scraping.
      if (!linkData.title || !linkData.favicon_url || !linkData.preview_image_url) {
        const [metadata, scraped] = await Promise.all([
          linksApi.extractMetadata(linkData.url),
          urlScraperApi.tryScrape(linkData.url),
        ])
        return linksApi.create({
          ...linkData,
          title: linkData.title || scraped.title || metadata.title,
          description: linkData.description || scraped.description || metadata.description,
          favicon_url: linkData.favicon_url || scraped.logo || metadata.favicon_url,
          preview_image_url: linkData.preview_image_url || scraped.image,
        })
      }
      return linksApi.create(linkData)
    },
    onMutate: async (linkData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: linkKeys.lists() })

      let title = linkData.title
      let description = linkData.description
      let favicon_url = linkData.favicon_url

      if (!title || !favicon_url) {
        const metadata = await linksApi.extractMetadata(linkData.url)
        title = title || metadata.title
        description = description || metadata.description
        favicon_url = favicon_url || metadata.favicon_url
      }

      let minOrder = 1
      for (const [, data] of queryClient.getQueriesData<LinkWithTag[]>({
        queryKey: linkKeys.lists(),
      })) {
        for (const link of data ?? []) {
          if (link.order_index != null) {
            minOrder = Math.min(minOrder, link.order_index)
          }
        }
      }

      // Create optimistic link
      const optimisticLink: LinkWithTag = {
        id: `temp-${Date.now()}`,
        project_id: linkData.project_id || 'pending',
        user_id: '', // Will be set by server
        url: linkData.url,
        title,
        description,
        favicon_url,
        preview_image_url: linkData.preview_image_url,
        tag_id: linkData.tag_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_index: linkData.order_index ?? minOrder - 1,
        is_super_favorite: false,
        tag: undefined,
        project: undefined,
      }

      // Optimistically update all relevant queries
      // This includes both byProject queries and byProjects queries
      queryClient.setQueriesData<LinkWithTag[]>(
        { queryKey: linkKeys.lists() },
        (old = []) => {
          if (!old) return [optimisticLink]
          // Check if link already exists (avoid duplicates)
          if (old.some(link => link.id === optimisticLink.id ||
            (link.url === optimisticLink.url && link.project_id === optimisticLink.project_id))) {
            return old
          }
          // Only add if this link belongs to the projects in this query
          // For byProjects queries, check if the project_id is in the projectIds array
          // For byProject queries, check if project_id matches
          // For all queries, always add
          return [optimisticLink, ...old]
        }
      )

      return { optimisticLink, projectId: linkData.project_id }
    },
    onSuccess: (data, _variables, context) => {
      // Replace optimistic link with real data
      const linkWithTag: LinkWithTag = {
        ...data,
        tag: undefined,
        project: undefined,
      }

      // Update all queries, replacing the optimistic link with the real one
      queryClient.setQueriesData<LinkWithTag[]>(
        { queryKey: linkKeys.lists() },
        (old = []) => {
          if (!old) return [linkWithTag]
          // Try to find and replace the optimistic link
          const optimisticIndex = old.findIndex(link => link.id === context?.optimisticLink.id)
          if (optimisticIndex >= 0) {
            const newData = [...old]
            newData[optimisticIndex] = linkWithTag
            return newData
          }
          // If optimistic link not found, check if real link already exists
          const existingIndex = old.findIndex(link => link.id === linkWithTag.id)
          if (existingIndex >= 0) {
            const newData = [...old]
            newData[existingIndex] = linkWithTag
            return newData
          }
          // Otherwise, add it at the top
          return [linkWithTag, ...old]
        }
      )

      addLink(data)
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic update on error
      if (context?.optimisticLink) {
        queryClient.setQueriesData<LinkWithTag[]>(
          { queryKey: linkKeys.lists() },
          (old = []) => {
            return old.filter(link => link.id !== context.optimisticLink.id)
          }
        )
      }

      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })
    },
  })
}

export const useUpdateLink = () => {
  const queryClient = useQueryClient()
  const updateLink = useAppStore(state => state.updateLink)

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateLinkData; oldProjectId?: string }) =>
      linksApi.update(id, updates),
    onSuccess: (data, variables) => {
      // Invalidate all link lists to refresh the UI
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })

      // Invalidate the new project's links
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: linkKeys.byProject(data.project_id) })
      }

      // If project changed, also invalidate the old project's links
      if (variables.oldProjectId && variables.oldProjectId !== data.project_id) {
        queryClient.invalidateQueries({ queryKey: linkKeys.byProject(variables.oldProjectId) })
      }

      queryClient.invalidateQueries({ queryKey: linkKeys.detail(data.id) })
      updateLink(data.id, data)
    },
  })
}

export const useDeleteLink = () => {
  const queryClient = useQueryClient()
  const removeLink = useAppStore(state => state.removeLink)

  return useMutation({
    mutationFn: linksApi.delete,
    onSuccess: (_, id) => {
      // We'll need to invalidate all project queries since we don't know which project this link belonged to
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })
      removeLink(id)
    },
  })
}

export const useReorderLinks = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: linksApi.reorder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })
    },
  })
}

export const useLinksByTag = (tagId: string) => {
  return useQuery({
    queryKey: [...linkKeys.lists(), { tagId }],
    queryFn: () => linksApi.getByTag(tagId),
    enabled: !!tagId,
  })
}

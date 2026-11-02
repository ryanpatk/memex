// Supabase adapter (see ../repository.ts). The queries are the web app's,
// moved here unchanged from src/hooks/*.ts on 2026-11-01.
import { getErrorMessage } from '../errors'
import type { LinksRepository } from '../repository'
import type { CreateLinkData, Link, LinkWithTag, UpdateLinkData } from '../types'
import type { MemexSupabaseClient } from './client'
import { requireUser } from './user'


export const createLinksRepository = (client: MemexSupabaseClient): LinksRepository => {
  const linksApi = {
    isMissingRelationError: (error: unknown, relation: string) => {
      const message = getErrorMessage(error)
      return message.includes(relation) && message.includes('does not exist')
    },
    getDefaultProjectId: async (): Promise<string> => {
      const user = await requireUser(client)

      const { data: existing, error: existingError } = await client
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Library')
        .limit(1)

      if (existingError) throw existingError
      if (existing && existing.length > 0) return existing[0].id

      const { data: created, error: createError } = await client
        .from('projects')
        .insert({
          user_id: user.id,
          name: 'Library',
          description: 'Default link library (hidden)',
          is_starred: false,
        })
        .select('id')
        .single()

      if (createError) throw createError
      return created.id
    },
    getByProject: async (projectId: string): Promise<LinkWithTag[]> => {
      try {
        const { data, error } = await client
          .from('links')
          .select(`
            *,
            tag:tags(*),
            link_tags:link_tags(tag:tags(*)),
            project:projects(id, name)
          `)
          .eq('project_id', projectId)
          .order('order_index', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        if (linksApi.isMissingRelationError(error, 'link_tags')) {
          const { data, error: fallbackError } = await client
            .from('links')
            .select(`
              *,
              tag:tags(*),
              project:projects(id, name)
            `)
            .eq('project_id', projectId)
            .order('order_index', { ascending: true })

          if (fallbackError) throw fallbackError
          return data || []
        }
        throw error
      }
    },

    getAll: async (): Promise<LinkWithTag[]> => {
      try {
        const { data, error } = await client
          .from('links')
          .select(`
            *,
            tag:tags(*),
            link_tags:link_tags(tag:tags(*)),
            project:projects(id, name)
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        if (linksApi.isMissingRelationError(error, 'link_tags')) {
          const { data, error: fallbackError } = await client
            .from('links')
            .select(`
              *,
              tag:tags(*),
              project:projects(id, name)
            `)
            .order('created_at', { ascending: false })

          if (fallbackError) throw fallbackError
          return data || []
        }
        throw error
      }
    },

    getByProjects: async (projectIds: string[]): Promise<LinkWithTag[]> => {
      if (projectIds.length === 0) {
        return linksApi.getAll()
      }

      try {
        const { data, error } = await client
          .from('links')
          .select(`
            *,
            tag:tags(*),
            link_tags:link_tags(tag:tags(*)),
            project:projects(id, name)
          `)
          .in('project_id', projectIds)
          .order('order_index', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        if (linksApi.isMissingRelationError(error, 'link_tags')) {
          const { data, error: fallbackError } = await client
            .from('links')
            .select(`
              *,
              tag:tags(*),
              project:projects(id, name)
            `)
            .in('project_id', projectIds)
            .order('order_index', { ascending: true })

          if (fallbackError) throw fallbackError
          return data || []
        }
        throw error
      }
    },

    getById: async (id: string): Promise<LinkWithTag | null> => {
      try {
        const { data, error } = await client
          .from('links')
          .select(`
            *,
            tag:tags(*),
            link_tags:link_tags(tag:tags(*)),
            project:projects(id, name)
          `)
          .eq('id', id)
          .single()

        if (error) throw error
        return data
      } catch (error: unknown) {
        if (linksApi.isMissingRelationError(error, 'link_tags')) {
          const { data, error: fallbackError } = await client
            .from('links')
            .select(`
              *,
              tag:tags(*),
              project:projects(id, name)
            `)
            .eq('id', id)
            .single()

          if (fallbackError) throw fallbackError
          return data
        }
        throw error
      }
    },

    // Get links by tag across all projects
    getByTag: async (tagId: string): Promise<LinkWithTag[]> => {
      try {
        const { data, error } = await client
          .from('links')
          .select(`
            *,
            tag:tags(*),
            link_tags:link_tags(tag:tags(*)),
            project:projects(name)
          `)
          .eq('tag_id', tagId)
          .order('order_index', { ascending: true })

        if (error) throw error
        return data || []
      } catch (error: unknown) {
        if (linksApi.isMissingRelationError(error, 'link_tags')) {
          const { data, error: fallbackError } = await client
            .from('links')
            .select(`
              *,
              tag:tags(*),
              project:projects(name)
            `)
            .eq('tag_id', tagId)
            .order('order_index', { ascending: true })

          if (fallbackError) throw fallbackError
          return data || []
        }
        throw error
      }
    },

    create: async (linkData: CreateLinkData): Promise<Link> => {
      const user = await requireUser(client)

      const projectId = linkData.project_id || await linksApi.getDefaultProjectId()

      // Place new links at the top of the project's order stack.
      const { data: existingLinks } = await client
        .from('links')
        .select('order_index')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true })
        .limit(1)

      const minOrder = existingLinks?.[0]?.order_index ?? 1

      const { data, error } = await client
        .from('links')
        .insert({
          ...linkData,
          user_id: user.id,
          project_id: projectId,
          order_index: linkData.order_index ?? minOrder - 1,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },

    update: async (id: string, updates: UpdateLinkData): Promise<Link> => {
      const { data, error } = await client
        .from('links')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await client
        .from('links')
        .delete()
        .eq('id', id)

      if (error) throw error
    },

    reorder: async (links: { id: string; order_index: number }[]): Promise<void> => {
      const updates = links.map(({ id, order_index }) =>
        client
          .from('links')
          .update({ order_index })
          .eq('id', id)
      )

      const results = await Promise.allSettled(updates)
      const errors = results.filter(r => r.status === 'rejected')

      if (errors.length > 0) {
        throw new Error('Failed to reorder some links')
      }
    },

  }

  const linkTagsApi = {
    setForLink: async (linkId: string, tagIds: string[]): Promise<void> => {
      try {
        const { error: deleteError } = await client
          .from('link_tags')
          .delete()
          .eq('link_id', linkId)

        if (deleteError) throw deleteError

        if (tagIds.length > 0) {
          const inserts = tagIds.map((tagId) => ({
            link_id: linkId,
            tag_id: tagId,
          }))

          const { error: insertError } = await client
            .from('link_tags')
            .insert(inserts)

          if (insertError) throw insertError
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (!message.includes('link_tags') || !message.includes('does not exist')) {
          throw error
        }
      }

      const { error: linkUpdateError } = await client
        .from('links')
        .update({ tag_id: tagIds[0] ?? null })
        .eq('id', linkId)

      if (linkUpdateError) throw linkUpdateError
    },
  }

  return {
    getAll: linksApi.getAll,
    getById: linksApi.getById,
    getByTag: linksApi.getByTag,
    getByProject: linksApi.getByProject,
    getByProjects: linksApi.getByProjects,
    create: linksApi.create,
    update: linksApi.update,
    delete: linksApi.delete,
    reorder: linksApi.reorder,
    setTags: linkTagsApi.setForLink,
  }
}

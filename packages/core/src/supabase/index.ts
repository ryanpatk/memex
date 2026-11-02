/**
 * @memex/core/supabase — the v1 Repository adapter (Supabase), and the one
 * way to create memex's Supabase client. Kept out of the main entry point so
 * pure consumers of @memex/core never load supabase-js.
 */
import type { Repository } from '../repository'
import { createAgentTokensRepository, createProposalsRepository } from './agentTokens'
import { createApiTokensRepository } from './apiTokens'
import { createAuthRepository } from './auth'
import type { MemexSupabaseClient } from './client'
import { createJotsRepository } from './jots'
import { createLinksRepository } from './links'
import { createNotesRepository } from './notes'
import { createProjectsRepository } from './projects'
import { createSpaceLinksRepository } from './spaceLinks'
import { createSpaceNotesRepository } from './spaceNotes'
import { createSpacesRepository } from './spaces'
import { createSpaceTasksRepository } from './spaceTasks'
import { createTagsRepository } from './tags'
import { createTasksRepository } from './tasks'
import { createSavedViewsRepository } from './views'

export { createMemexClient } from './client'
export type { AuthStorage, MemexClientOptions, MemexSupabaseClient } from './client'

/** Every Repository area on one Supabase client (RLS scopes each query to the signed-in user). */
export const createSupabaseRepository = (client: MemexSupabaseClient): Repository => ({
  auth: createAuthRepository(client),
  links: createLinksRepository(client),
  notes: createNotesRepository(client),
  tasks: createTasksRepository(client),
  tags: createTagsRepository(client),
  spaces: createSpacesRepository(client),
  jots: createJotsRepository(client),
  spaceLinks: createSpaceLinksRepository(client),
  spaceNotes: createSpaceNotesRepository(client),
  spaceTasks: createSpaceTasksRepository(client),
  apiTokens: createApiTokensRepository(client),
  agentTokens: createAgentTokensRepository(client),
  proposals: createProposalsRepository(client),
  views: createSavedViewsRepository(client),
  projects: createProjectsRepository(client),
})

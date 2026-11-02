// Supabase adapter (see ../repository.ts): agent tokens and Inbox proposals,
// both written by memex-api and only listed / revoked / decided here. RLS
// (20261102120000, 20261103120000) limits the app to its own rows, lets it
// set only agent_tokens.revoked_at and only move a pending proposal to
// applied or rejected.
import { getErrorMessage } from '../errors'
import type { AgentTokensRepository, ProposalsRepository } from '../repository'
import type { AgentToken, InboxProposal } from '../types'
import type { MemexSupabaseClient } from './client'

const TOKEN_COLUMNS = 'id,client_name,scope,created_at,expires_at,revoked_at,last_used_at'

const isMissing = (error: unknown, relation: string) => {
  const message = getErrorMessage(error)
  return message.includes(relation) && (message.includes('does not exist') || message.includes('schema cache'))
}

export const createAgentTokensRepository = (client: MemexSupabaseClient): AgentTokensRepository => ({
  getAll: async (): Promise<AgentToken[]> => {
    const { data, error } = await client
      .from('agent_tokens')
      .select(TOKEN_COLUMNS)
      .order('created_at', { ascending: false })
    if (error) {
      if (isMissing(error, 'agent_tokens')) return []
      throw error
    }
    return (data ?? []) as AgentToken[]
  },

  revoke: async (id: string): Promise<void> => {
    const { error } = await client
      .from('agent_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('revoked_at', null)
    if (error) throw error
  },

  revokeAll: async (): Promise<number> => {
    const { data, error } = await client
      .from('agent_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .is('revoked_at', null)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  },
})

export const createProposalsRepository = (client: MemexSupabaseClient): ProposalsRepository => ({
  getPending: async (): Promise<InboxProposal[]> => {
    const { data, error } = await client
      .from('inbox_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      if (isMissing(error, 'inbox_proposals')) return []
      throw error
    }
    return (data ?? []) as InboxProposal[]
  },

  decide: async (id: string, status: 'applied' | 'rejected'): Promise<void> => {
    const { data, error } = await client
      .from('inbox_proposals')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
    if (error) throw error
    if (!data?.length) throw new Error('This proposal was already decided')
  },
})

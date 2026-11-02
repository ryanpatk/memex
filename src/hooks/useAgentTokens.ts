import { useCallback, useEffect, useState } from 'react'
import type { AgentToken } from '@memex/core'
import { repository } from '../data/repository'
import { createAgentToken, type NewAgentToken } from '../data/memexApi'

export type AgentTokenStatus = 'active' | 'expired' | 'revoked'

export const agentTokenStatus = (token: AgentToken, now = Date.now()): AgentTokenStatus =>
  token.revoked_at ? 'revoked' : token.expires_at && Date.parse(token.expires_at) <= now ? 'expired' : 'active'

/**
 * MCP agent tokens for Settings → Agent tokens. Plain state rather than React
 * Query, like useApiTokens: the account menus render outside the app's
 * QueryClientProvider. Creating goes through memex-api (the token is made
 * server-side and returned once); revoking goes straight to the database
 * through RLS, so the kill switch works even when memex-api is down.
 */
export const useAgentTokens = (enabled: boolean) => {
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      setTokens(await repository.agentTokens.getAll())
      setLoadError(null)
    } catch {
      setLoadError('Couldn’t load agent tokens.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) void reload()
  }, [enabled, reload])

  const create = useCallback(async (input: NewAgentToken): Promise<string> => {
    const { token, agentToken } = await createAgentToken(input)
    setTokens((prev) => [agentToken, ...prev])
    return token
  }, [])

  const revoke = useCallback(async (id: string) => {
    await repository.agentTokens.revoke(id)
    const at = new Date().toISOString()
    setTokens((prev) => prev.map((t) => (t.id === id && !t.revoked_at ? { ...t, revoked_at: at } : t)))
  }, [])

  const revokeAll = useCallback(async (): Promise<number> => {
    const count = await repository.agentTokens.revokeAll()
    await reload()
    return count
  }, [reload])

  return { tokens, isLoading, loadError, create, revoke, revokeAll }
}

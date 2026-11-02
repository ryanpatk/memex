import type { AgentToken } from '@memex/core'
import { repository } from './repository'

/**
 * memex-api, for the one thing the web app asks of it: creating MCP agent
 * tokens (`POST /agent-tokens`, api/src/agentTokens.ts). The Worker checks
 * the signed-in session with Supabase Auth, generates the token, stores only
 * its hash and returns the plaintext once; nothing here keeps it.
 * `VITE_MEMEX_API_URL` overrides the production URL (e.g. `wrangler dev`).
 */
export const MEMEX_API_URL = (import.meta.env.VITE_MEMEX_API_URL || 'https://memex-api.joyfulsystems.workers.dev').replace(/\/$/, '')

/** The hosted MCP endpoint agents connect to (docs/mcp.md). */
export const MCP_ENDPOINT = `${MEMEX_API_URL}/mcp`

export interface NewAgentToken {
  name: string
  scope: AgentToken['scope']
  /** null: never expires. */
  expiresInDays: number | null
}

export async function createAgentToken(input: NewAgentToken): Promise<{ token: string; agentToken: AgentToken }> {
  const session = await repository.auth.getSession()
  if (!session) throw new Error('Sign in again to create a token.')
  let res: Response
  try {
    res = await fetch(`${MEMEX_API_URL}/agent-tokens`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ name: input.name, scope: input.scope, expires_in_days: input.expiresInDays }),
    })
  } catch {
    throw new Error('Couldn’t reach memex-api. Check your connection and try again.')
  }
  const json = (await res.json().catch(() => null)) as
    | { success: true; data: { token: string; agent_token: AgentToken } }
    | { success: false; error?: string }
    | null
  if (!res.ok || !json || !json.success) {
    throw new Error((json && !json.success && json.error) || 'memex couldn’t create the token.')
  }
  return { token: json.data.token, agentToken: json.data.agent_token }
}

import { isTransientError } from '../errors'
import type { MemexSupabaseClient } from './client'

/**
 * The signed-in user, for writes that stamp `user_id`. When the auth server
 * can't be reached (offline), its own error is thrown, so a caller can tell
 * "try again later" from "signed out".
 */
export const requireUser = async (client: MemexSupabaseClient) => {
  const { data, error } = await client.auth.getUser()
  if (data?.user) return data.user
  if (error && isTransientError(error)) throw error
  throw new Error('User not authenticated')
}

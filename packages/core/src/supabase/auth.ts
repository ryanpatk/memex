// Supabase adapter (see ../repository.ts): Supabase Auth behind AuthRepository.
// Same calls the web app made directly before 2026-11-01.
import type { AuthRepository, AuthResult } from '../repository'
import type { MemexSupabaseClient } from './client'

const result = (error: { message: string } | null): AuthResult => ({ error })

export const createAuthRepository = (client: MemexSupabaseClient): AuthRepository => ({
  getSession: async () => {
    const {
      data: { session },
    } = await client.auth.getSession()
    return session
  },

  onAuthStateChange: (listener) => {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      listener(session)
    })
    return () => data.subscription.unsubscribe()
  },

  signInWithPassword: async ({ email, password }) => {
    const { error } = await client.auth.signInWithPassword({ email, password })
    return result(error)
  },

  signUp: async ({ email, password }) => {
    const { error } = await client.auth.signUp({ email, password })
    return result(error)
  },

  signInWithOAuth: async (provider, { redirectTo, skipBrowserRedirect }) => {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: skipBrowserRedirect ? { redirectTo, skipBrowserRedirect } : { redirectTo },
    })
    return data?.url ? { error, url: data.url } : result(error)
  },

  exchangeCodeForSession: async (code) => {
    const { error } = await client.auth.exchangeCodeForSession(code)
    return result(error)
  },

  setAutoRefresh: (active) => {
    void (active ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh())
  },

  signOut: async () => {
    const { error } = await client.auth.signOut()
    return result(error)
  },
})

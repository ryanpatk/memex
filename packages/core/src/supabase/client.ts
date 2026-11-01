import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types'

/*
 * One way to build memex's Supabase client, shared by every client app
 * (decision 20, 2026-11-01: the web app and the Expo app both talk to
 * Supabase directly through @memex/core; RLS keeps each user to their rows).
 * Only the anon key belongs in a client; never pass the service-role key.
 */

export type MemexSupabaseClient = SupabaseClient<Database>

/**
 * Where the auth session is persisted. Web: omit it and supabase-js uses
 * localStorage. Expo: pass a SecureStore-backed adapter, e.g.
 *   { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync,
 *     removeItem: SecureStore.deleteItemAsync }
 * (SecureStore values are capped at 2 KB; if a session outgrows that, store
 * an encryption key in SecureStore and the encrypted session in AsyncStorage.)
 */
export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface MemexClientOptions {
  url: string
  anonKey: string
  /**
   * Auth overrides. Omit on web to keep supabase-js's browser defaults
   * (localStorage, refresh timers, OAuth callback detection in the URL).
   * Expo: `{ storage, detectSessionInUrl: false }`.
   */
  auth?: {
    storage?: AuthStorage
    persistSession?: boolean
    autoRefreshToken?: boolean
    detectSessionInUrl?: boolean
  }
}

export const createMemexClient = ({ url, anonKey, auth }: MemexClientOptions): MemexSupabaseClient =>
  auth ? createClient<Database>(url, anonKey, { auth }) : createClient<Database>(url, anonKey)

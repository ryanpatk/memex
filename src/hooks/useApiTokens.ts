import { useCallback, useEffect, useState } from 'react'
import supabase from '../supabase'
import { ApiToken } from '@memex/core'

/** Generates `mx_` + 256 bits of randomness, base64url. Shown once, never stored. */
const generateToken = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const base64 = btoa(String.fromCharCode(...bytes))
  return `mx_${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Token management without React Query: the account menus (header/footer)
 * render outside the app's QueryClientProvider, and this tiny list doesn't
 * need caching anyway.
 */
export const useApiTokens = (enabled: boolean) => {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setIsLoading(true)

    supabase
      .from('api_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setTokens(data ?? [])
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  const createToken = useCallback(async (name: string): Promise<string> => {
    setIsCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const token = generateToken()
      const token_hash = await sha256Hex(token)

      const { data, error } = await supabase
        .from('api_tokens')
        .insert({ user_id: user.id, name: name.trim() || 'Untitled token', token_hash })
        .select()
        .single()
      if (error) throw error

      setTokens((prev) => [data, ...prev])
      return token
    } finally {
      setIsCreating(false)
    }
  }, [])

  const revokeToken = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('api_tokens').delete().eq('id', id)
    if (error) throw error
    setTokens((prev) => prev.filter((token) => token.id !== id))
  }, [])

  return { tokens, isLoading, isCreating, createToken, revokeToken }
}

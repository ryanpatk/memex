import { useCallback, useEffect, useState } from 'react'
import { repository } from '../data/repository'
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

    repository.apiTokens.getAll().then(
      (data) => {
        if (cancelled) return
        setTokens(data)
        setIsLoading(false)
      },
      () => {
        if (cancelled) return
        setIsLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [enabled])

  const createToken = useCallback(async (name: string): Promise<string> => {
    setIsCreating(true)
    try {
      const token = generateToken()
      const token_hash = await sha256Hex(token)

      const data = await repository.apiTokens.create({ name: name.trim() || 'Untitled token', token_hash })

      setTokens((prev) => [data, ...prev])
      return token
    } finally {
      setIsCreating(false)
    }
  }, [])

  const revokeToken = useCallback(async (id: string): Promise<void> => {
    await repository.apiTokens.delete(id)
    setTokens((prev) => prev.filter((token) => token.id !== id))
  }, [])

  return { tokens, isLoading, isCreating, createToken, revokeToken }
}

import { describe, expect, it, vi } from 'vitest'
import { createAuthRepository } from './auth'
import type { MemexSupabaseClient } from './client'

/* The auth adapter's native OAuth path (Expo, PKCE) against a stub client. */

const stubClient = () => {
  const auth = {
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'github', url: 'https://gh.example/authorize' }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
    startAutoRefresh: vi.fn(async () => {}),
    stopAutoRefresh: vi.fn(async () => {}),
  }
  return { auth, client: { auth } as unknown as MemexSupabaseClient }
}

describe('createAuthRepository', () => {
  it('keeps the web redirect call unchanged', async () => {
    const { auth, client } = stubClient()
    await createAuthRepository(client).signInWithOAuth('github', { redirectTo: 'https://memex.test/' })
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'github', options: { redirectTo: 'https://memex.test/' } })
  })

  it('returns the provider URL when the browser redirect is skipped', async () => {
    const { auth, client } = stubClient()
    const res = await createAuthRepository(client).signInWithOAuth('github', {
      redirectTo: 'memex://auth/callback',
      skipBrowserRedirect: true,
    })
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: 'memex://auth/callback', skipBrowserRedirect: true },
    })
    expect(res).toEqual({ error: null, url: 'https://gh.example/authorize' })
  })

  it('exchanges a PKCE code and reports errors as messages', async () => {
    const { auth, client } = stubClient()
    const repo = createAuthRepository(client)
    expect(await repo.exchangeCodeForSession('abc')).toEqual({ error: null })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc')
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: { message: 'bad code' } })
    expect(await repo.exchangeCodeForSession('nope')).toEqual({ error: { message: 'bad code' } })
  })

  it('starts and stops token refresh', () => {
    const { auth, client } = stubClient()
    const repo = createAuthRepository(client)
    repo.setAutoRefresh(true)
    repo.setAutoRefresh(false)
    expect(auth.startAutoRefresh).toHaveBeenCalledOnce()
    expect(auth.stopAutoRefresh).toHaveBeenCalledOnce()
  })
})

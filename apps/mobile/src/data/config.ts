/*
 * Public client settings, inlined by Expo at build time from apps/mobile/.env
 * (EXPO_PUBLIC_*), mirroring the web's VITE_SUPABASE_*. Only the anon key
 * belongs in a client; RLS limits every query to the signed-in user.
 * process.env.EXPO_PUBLIC_X must be written out in full for inlining to work.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * DEV-ONLY demo mode: `1` = demo data with a signed-in demo user,
 * `signed-out` = demo data starting at the sign-in screen. Ignored in release
 * builds (__DEV__ is false there, so the fixture code is stripped).
 */
const FIXTURES = process.env.EXPO_PUBLIC_MEMEX_FIXTURES ?? '';
export const FIXTURE_MODE: 'off' | 'signed-in' | 'signed-out' = !__DEV__ || !FIXTURES
  ? 'off'
  : FIXTURES === 'signed-out'
    ? 'signed-out'
    : 'signed-in';

export const isConfigured = FIXTURE_MODE !== 'off' || Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

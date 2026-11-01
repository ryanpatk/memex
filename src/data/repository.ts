import { createMemexClient, createSupabaseRepository } from '@memex/core/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/**
 * The app's one Repository (see @memex/core). All data access goes through
 * it: hooks wrap it in React Query, the session context uses its auth. No
 * component or page talks to Supabase directly.
 */
export const repository = createSupabaseRepository(
  createMemexClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }),
);

import { createMemexClient, createSupabaseRepository } from '@memex/core/supabase';
import { createDemoData, createMemoryRepository } from '@memex/core/memory';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/**
 * Dev fixture mode: `VITE_MEMEX_FIXTURES=1 npm run dev` runs the whole app on
 * made-up demo data in memory (signed in, nothing persists, no network), for
 * checking UI without an account and for screenshots. `VITE_MEMEX_FIXTURES=
 * signed-out` starts signed out. `import.meta.env.DEV` is false in builds, so
 * production never takes this branch and the bundler drops the module.
 */
const FIXTURES = import.meta.env.DEV ? import.meta.env.VITE_MEMEX_FIXTURES : undefined;

/**
 * The app's one Repository (see @memex/core). All data access goes through
 * it: hooks wrap it in React Query, the session context uses its auth. No
 * component or page talks to Supabase directly.
 */
export const repository = FIXTURES
  ? createMemoryRepository(createDemoData(), { signedOut: FIXTURES === 'signed-out' })
  : createSupabaseRepository(createMemexClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }));

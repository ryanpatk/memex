import { createAppRepository } from './createAppRepository';

/**
 * Dev fixture mode: `VITE_MEMEX_FIXTURES=1 npm run dev` runs the whole app on
 * made-up demo data in memory (signed in, nothing persists, no network, no
 * env file needed), for checking UI without an account and for screenshots.
 * `VITE_MEMEX_FIXTURES=signed-out` starts signed out; `large` (or
 * `large:<n>`) adds thousands of generated items for performance checks.
 * `import.meta.env.DEV` is false in builds, so production never takes this
 * branch. The one exception is a local `vite build --mode bench`, for
 * measuring a production bundle (docs/library-grid-performance.md); deploys
 * build in production mode.
 */
const FIXTURES =
  import.meta.env.DEV || import.meta.env.MODE === 'bench' ? import.meta.env.VITE_MEMEX_FIXTURES : undefined;

const app = createAppRepository({ fixtures: FIXTURES, env: import.meta.env });

/**
 * The app's one Repository (see @memex/core). All data access goes through
 * it: hooks wrap it in React Query, the session context uses its auth. No
 * component or page talks to Supabase directly.
 */
export const repository = app.repository;

/** Set when real mode is missing its Supabase settings; main.tsx shows it instead of the app. */
export const repositoryConfigError = app.configError;

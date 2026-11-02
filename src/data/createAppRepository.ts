import type { Repository } from '@memex/core';
import { createMemexClient, createSupabaseRepository } from '@memex/core/supabase';
import { createDemoData, createMemoryRepository } from '@memex/core/memory';
import { MissingEnvError, readSupabaseConfig } from '../config';

type EnvLike = Partial<Record<string, string | boolean | undefined>>;

export type AppRepositoryResult =
  | { repository: Repository; configError: null }
  | { repository: Repository; configError: MissingEnvError };

/**
 * The app's Repository for a mode and an env (src/data/repository.ts passes
 * `import.meta.env`). Fixture mode never reads the Supabase settings. Real
 * mode with settings missing returns `configError` and a repository whose
 * every call throws it; main.tsx shows the error instead of the app.
 */
export const createAppRepository = ({ fixtures, env }: { fixtures: string | undefined; env: EnvLike }): AppRepositoryResult => {
  if (fixtures) {
    return { repository: createMemoryRepository(createDemoData(), { signedOut: fixtures === 'signed-out' }), configError: null };
  }
  try {
    const { url, anonKey } = readSupabaseConfig(env);
    return { repository: createSupabaseRepository(createMemexClient({ url, anonKey })), configError: null };
  } catch (error) {
    if (!(error instanceof MissingEnvError)) throw error;
    // Hooks alias areas at import (`repository.links`), so only a call throws
    const unavailable: unknown = new Proxy(() => undefined, {
      get: () => unavailable,
      apply: () => {
        throw error;
      },
    });
    return { repository: unavailable as Repository, configError: error };
  }
};

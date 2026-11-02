/*
 * The Supabase settings the real (non-fixture) app needs, read lazily: only
 * the Supabase repository asks for them, so fixture mode
 * (`VITE_MEMEX_FIXTURES=1`) runs without any env file. A missing value is
 * reported in the app (components/MissingEnv.tsx), not with a blocking alert.
 */

export const SUPABASE_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

type EnvLike = Partial<Record<string, string | boolean | undefined>>;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export class MissingEnvError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing ${missing.join(' / ')}`);
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

/** The Supabase URL and anon key from `env`, or a MissingEnvError naming what's absent. */
export const readSupabaseConfig = (env: EnvLike): SupabaseConfig => {
  const missing = SUPABASE_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || !value.trim();
  });
  if (missing.length) throw new MissingEnvError([...missing]);
  return { url: env.VITE_SUPABASE_URL as string, anonKey: env.VITE_SUPABASE_ANON_KEY as string };
};

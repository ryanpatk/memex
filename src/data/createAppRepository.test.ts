import { describe, expect, it } from 'vitest';
import { createAppRepository } from './createAppRepository';
import { MissingEnvError, readSupabaseConfig } from '../config';

describe('createAppRepository', () => {
  it('runs fixture mode with no Supabase env at all', async () => {
    const { repository, configError } = createAppRepository({ fixtures: '1', env: {} });
    expect(configError).toBeNull();
    expect((await repository.spaces.getAll()).length).toBeGreaterThan(0);
    expect(await repository.auth.getSession()).not.toBeNull();
  });

  it('starts signed out in fixture mode when asked', async () => {
    const { repository } = createAppRepository({ fixtures: 'signed-out', env: {} });
    expect(await repository.auth.getSession()).toBeNull();
  });

  it('reports missing env in real mode instead of throwing at import', () => {
    const { repository, configError } = createAppRepository({ fixtures: undefined, env: { VITE_SUPABASE_URL: ' ' } });
    expect(configError).toBeInstanceOf(MissingEnvError);
    expect(configError?.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    // Anything that still reaches for the repository gets the same clear error
    const links = repository.links; // modules alias areas at import: that must not throw
    expect(() => links.getAll()).toThrow('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  });
});

describe('readSupabaseConfig', () => {
  it('names only what is missing', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toThrow('Missing VITE_SUPABASE_ANON_KEY');
  });

  it('returns both values when present', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    });
  });
});

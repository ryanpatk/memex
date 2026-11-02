import type { Repository } from '@memex/core';
import { createMemoryRepository, type MemoryData } from '@memex/core/memory';
import { buildDemoData, type DemoData } from './demoData';

/*
 * DEV-ONLY: the app on invented demo data, for running it and taking
 * screenshots without a real account. Enabled only when
 * EXPO_PUBLIC_MEMEX_FIXTURES is set in a development build (../repository.ts);
 * release builds never include it. It's core's in-memory Repository, so
 * writes work (composing, ticking, filing, deleting) and vanish on reload;
 * nothing reaches Supabase. Auth accepts any credentials.
 */

const DEMO_USER = { id: 'demo-user', email: 'demo@memex.app', user_metadata: { full_name: 'Demo' } };

export const toMemoryData = (data: DemoData): MemoryData => ({
  user: DEMO_USER,
  links: data.links,
  notes: data.notes,
  tasks: data.tasks,
  tags: [],
  spaces: data.spaces,
  jots: data.jots,
  linkTags: [],
  noteTags: [],
  taskTags: [],
  spaceLinks: data.membership.links,
  spaceNotes: data.membership.notes,
  spaceTasks: data.membership.tasks,
  views: [],
  proposals: data.proposals,
});

export const createFixtureRepository = ({ signedIn = true, now = new Date() } = {}): Repository => {
  const base = createMemoryRepository(toMemoryData(buildDemoData(now)), { signedOut: !signedIn });
  const signIn = () => base.auth.signInWithPassword({ email: DEMO_USER.email, password: 'demo' });
  return {
    ...base,
    auth: {
      ...base.auth,
      // "Continue with GitHub" signs straight in on demo data.
      signInWithOAuth: async () => {
        await signIn();
        return { error: null };
      },
      exchangeCodeForSession: async () => signIn(),
      signUp: async () => ({ error: { message: 'Sign-up is off in demo mode' } }),
    },
  };
};

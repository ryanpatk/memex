import type { AuthSession, Repository } from '@memex/core';
import { buildDemoData } from './demoData';

/*
 * DEV-ONLY: a Repository over invented demo data, for running the app and
 * taking screenshots without a real account. Enabled only when
 * EXPO_PUBLIC_MEMEX_FIXTURES is set in a development build (../repository.ts);
 * release builds never include it. Reads return demo rows; every write
 * rejects, so nothing pretends to be saved. Auth accepts any credentials.
 */

const readOnly = () => Promise.reject(new Error('Demo data is read-only'));

const DEMO_SESSION: AuthSession = {
  user: { id: 'demo-user', email: 'demo@memex.app', user_metadata: { full_name: 'Demo' } },
  access_token: 'demo',
};

export const createFixtureRepository = ({ signedIn = true, now = new Date() } = {}): Repository => {
  const data = buildDemoData(now);
  let session: AuthSession | null = signedIn ? DEMO_SESSION : null;
  const listeners = new Set<(s: AuthSession | null) => void>();
  const setSession = (next: AuthSession | null) => {
    session = next;
    listeners.forEach((l) => l(next));
  };
  const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    auth: {
      getSession: async () => session,
      onAuthStateChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      signInWithPassword: async () => {
        setSession(DEMO_SESSION);
        return { error: null };
      },
      signUp: async () => ({ error: { message: 'Sign-up is off in demo mode' } }),
      signInWithOAuth: async () => {
        setSession(DEMO_SESSION);
        return { error: null };
      },
      exchangeCodeForSession: async () => ({ error: null }),
      setAutoRefresh: () => {},
      signOut: async () => {
        setSession(null);
        return { error: null };
      },
    },
    links: {
      getAll: async () => newestFirst(data.links),
      getById: async (id) => data.links.find((l) => l.id === id) ?? null,
      getByTag: async () => [],
      getByProject: async () => [],
      getByProjects: async () => newestFirst(data.links),
      create: readOnly,
      update: readOnly,
      delete: readOnly,
      reorder: readOnly,
      setTags: readOnly,
    },
    notes: { getAll: async () => newestFirst(data.notes), create: readOnly, update: readOnly, delete: readOnly, setTags: readOnly },
    tasks: { getAll: async () => data.tasks, create: readOnly, update: readOnly, delete: readOnly, setTags: readOnly },
    tags: { getAll: async () => [], getById: async () => null, create: readOnly, update: readOnly, delete: readOnly, getUsageCount: async () => 0 },
    spaces: {
      getAll: async () => data.spaces,
      getById: async (id) => data.spaces.find((s) => s.id === id) ?? null,
      create: readOnly,
      update: readOnly,
      delete: readOnly,
    },
    jots: { getAll: async () => data.jots, create: readOnly, delete: readOnly },
    spaceLinks: {
      listMembership: async () => data.membership.links,
      setSuperFavorite: readOnly,
      getBySpace: async () => [],
      addLinks: readOnly,
      removeLink: readOnly,
    },
    spaceNotes: { listMembership: async () => data.membership.notes, addNotes: readOnly, removeNote: readOnly },
    spaceTasks: { listMembership: async () => data.membership.tasks, addTasks: readOnly, removeTask: readOnly },
    apiTokens: { getAll: async () => [], create: readOnly, delete: readOnly },
    views: { getAll: async () => [], create: readOnly, update: readOnly, delete: readOnly },
    projects: { getAll: async () => [], getById: async () => null, create: readOnly, update: readOnly, delete: readOnly },
  };
};

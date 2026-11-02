import type { AuthSession, AuthUser, Repository } from '../repository';
import type {
  AgentToken,
  InboxProposal,
  Link,
  LinkWithTag,
  Note,
  NoteWithTags,
  Profile,
  ProfileLink,
  ProjectWithCounts,
  SavedView,
  SelfMessage,
  Tag,
  Task,
  TaskWithTags,
} from '../types';

/*
 * An in-memory Repository: the whole interface over plain arrays, for the
 * web app's dev fixture mode (`VITE_MEMEX_FIXTURES=1`), screenshots with demo
 * data, and tests. Nothing persists past a reload. Never used in production
 * builds (src/data/repository.ts only reaches it under `import.meta.env.DEV`).
 */

export interface MemoryData {
  user: AuthUser;
  links: Link[];
  notes: Note[];
  tasks: Task[];
  tags: Tag[];
  spaces: Profile[];
  jots: SelfMessage[];
  /** [tagId, itemId] pairs per type. */
  linkTags: [string, string][];
  noteTags: [string, string][];
  taskTags: [string, string][];
  spaceLinks: { profile_id: string; link_id: string; is_super_favorite?: boolean }[];
  spaceNotes: { profile_id: string; note_id: string }[];
  spaceTasks: { profile_id: string; task_id: string }[];
  views: SavedView[];
  /** MCP agent tokens and pending Inbox proposals (optional: older seeds have none). */
  agentTokens?: AgentToken[];
  proposals?: InboxProposal[];
}

export interface MemoryRepositoryOptions {
  /** Start signed out (to check the sign-in redirect). */
  signedOut?: boolean;
}

/** Plain data only, so a JSON round trip is a full copy (and works in every runtime). */
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

let counter = 0;
const newId = () => {
  counter += 1;
  return `mem-${Date.now().toString(36)}-${counter.toString(36)}`;
};
const now = () => new Date().toISOString();

export const createMemoryRepository = (seed: MemoryData, options: MemoryRepositoryOptions = {}): Repository => {
  const db: MemoryData = clone(seed);
  const userId = db.user.id;
  let session: AuthSession | null = options.signedOut
    ? null
    : { user: db.user, access_token: 'memory', expires_at: Math.floor(Date.now() / 1000) + 86400 };
  const listeners = new Set<(session: AuthSession | null) => void>();

  // Callers get copies, like rows off the network, so cache updates never alias the store
  const wait = <T>(value: T): Promise<T> => Promise.resolve(clone(value));

  const setSession = (next: AuthSession | null) => {
    session = next;
    listeners.forEach((listener) => listener(session));
  };

  const tagById = (id: string) => db.tags.find((tag) => tag.id === id);
  const tagsFor = (pairs: [string, string][], itemId: string) =>
    pairs.filter(([, id]) => id === itemId).map(([tagId]) => tagById(tagId)).filter((tag): tag is Tag => Boolean(tag));

  const withLinkTags = (link: Link): LinkWithTag => ({
    ...link,
    tag: link.tag_id ? tagById(link.tag_id) : undefined,
    link_tags: tagsFor(db.linkTags, link.id).map((tag) => ({
      id: `${tag.id}:${link.id}`,
      link_id: link.id,
      tag_id: tag.id,
      created_at: link.created_at,
      tag,
    })),
  });
  const withNoteTags = (note: Note): NoteWithTags => ({
    ...note,
    note_tags: tagsFor(db.noteTags, note.id).map((tag) => ({
      id: `${tag.id}:${note.id}`,
      note_id: note.id,
      tag_id: tag.id,
      created_at: note.created_at,
      tag,
    })),
  });
  const withTaskTags = (task: Task): TaskWithTags => ({
    ...task,
    task_tags: tagsFor(db.taskTags, task.id).map((tag) => ({
      id: `${tag.id}:${task.id}`,
      task_id: task.id,
      tag_id: tag.id,
      created_at: task.created_at,
      tag,
    })),
  });

  const byCreatedDesc = <T extends { created_at: string }>(a: T, b: T) => (a.created_at < b.created_at ? 1 : -1);

  const find = <T extends { id: string }>(list: T[], id: string): T => {
    const row = list.find((entry) => entry.id === id);
    if (!row) throw new Error(`Not found: ${id}`);
    return row;
  };

  const patch = <T extends { id: string; updated_at?: string }>(list: T[], id: string, updates: Partial<T>): T => {
    const row = find(list, id);
    Object.assign(row, updates, 'updated_at' in row ? { updated_at: now() } : {});
    return row;
  };

  const remove = <T extends { id: string }>(list: T[], id: string) => {
    const index = list.findIndex((entry) => entry.id === id);
    if (index !== -1) list.splice(index, 1);
  };

  const setTags = (pairs: [string, string][], itemId: string, tagIds: string[]) => {
    for (let i = pairs.length - 1; i >= 0; i -= 1) if (pairs[i][1] === itemId) pairs.splice(i, 1);
    tagIds.forEach((tagId) => pairs.push([tagId, itemId]));
  };

  return {
    auth: {
      getSession: () => wait(session),
      onAuthStateChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      signInWithPassword: async () => {
        setSession({ user: db.user, access_token: 'memory' });
        return { error: null };
      },
      signUp: async () => ({ error: null }),
      signInWithOAuth: async () => ({ error: { message: 'OAuth is not available with demo data.' } }),
      exchangeCodeForSession: async () => ({ error: { message: 'OAuth is not available with demo data.' } }),
      setAutoRefresh: () => {},
      signOut: async () => {
        setSession(null);
        return { error: null };
      },
    },

    links: {
      getAll: () => wait([...db.links].sort(byCreatedDesc).map(withLinkTags)),
      getById: (id) => wait(db.links.find((link) => link.id === id) ? withLinkTags(find(db.links, id)) : null),
      getByTag: (tagId) => wait(db.links.filter((link) => link.tag_id === tagId).map(withLinkTags)),
      getByProject: () => wait([]),
      getByProjects: () => wait(db.links.map(withLinkTags)),
      create: (data) => {
        const link: Link = {
          id: newId(),
          user_id: userId,
          project_id: data.project_id ?? 'library',
          url: data.url,
          title: data.title,
          description: data.description,
          favicon_url: data.favicon_url,
          preview_image_url: data.preview_image_url,
          source: data.source ?? null,
          source_id: data.source_id ?? null,
          lists: data.lists ?? [],
          captured_by: data.captured_by ?? null,
          captured_client: data.captured_client ?? null,
          url_key: data.url_key ?? null,
          order_index: 0,
          created_at: now(),
          updated_at: now(),
        };
        db.links.push(link);
        return wait(link);
      },
      update: (id, updates) => wait(patch(db.links, id, updates)),
      delete: (id) => {
        remove(db.links, id);
        db.spaceLinks = db.spaceLinks.filter((row) => row.link_id !== id);
        return wait(undefined);
      },
      reorder: () => wait(undefined),
      setTags: (linkId, tagIds) => {
        setTags(db.linkTags, linkId, tagIds);
        return wait(undefined);
      },
    },

    notes: {
      getAll: () =>
        wait([...db.notes].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).map(withNoteTags)),
      create: (data) => {
        const saved = data.id ? db.notes.find((row) => row.id === data.id) : undefined;
        if (saved) return wait(saved);
        const note: Note = {
          id: data.id ?? newId(),
          user_id: userId,
          title: data.title,
          body: data.body ?? '',
          order_index: 0,
          created_at: now(),
          updated_at: now(),
        };
        db.notes.push(note);
        return wait(note);
      },
      update: (id, updates) =>
        wait(patch(db.notes, id, { ...updates, title: updates.title ?? undefined } as Partial<Note>)),
      delete: (id) => {
        remove(db.notes, id);
        db.spaceNotes = db.spaceNotes.filter((row) => row.note_id !== id);
        return wait(undefined);
      },
      setTags: (noteId, tagIds) => {
        setTags(db.noteTags, noteId, tagIds);
        return wait(undefined);
      },
    },

    tasks: {
      getAll: () => wait([...db.tasks].sort((a, b) => a.order_index - b.order_index).map(withTaskTags)),
      create: (data) => {
        const saved = data.id ? db.tasks.find((row) => row.id === data.id) : undefined;
        if (saved) return wait(saved);
        const task: Task = {
          id: data.id ?? newId(),
          user_id: userId,
          title: data.title,
          detail: data.detail,
          due_date: data.due_date,
          is_done: false,
          order_index: Math.min(0, ...db.tasks.map((t) => t.order_index)) - 1,
          created_at: now(),
          updated_at: now(),
        };
        db.tasks.push(task);
        return wait(task);
      },
      // null clears the due date; an update that leaves it out keeps it
      update: (id, updates) =>
        wait(
          patch(db.tasks, id, {
            ...updates,
            ...('due_date' in updates ? { due_date: updates.due_date ?? undefined } : {}),
          } as Partial<Task>),
        ),
      delete: (id) => {
        remove(db.tasks, id);
        db.spaceTasks = db.spaceTasks.filter((row) => row.task_id !== id);
        return wait(undefined);
      },
      setTags: (taskId, tagIds) => {
        setTags(db.taskTags, taskId, tagIds);
        return wait(undefined);
      },
    },

    tags: {
      getAll: () => wait([...db.tags].sort((a, b) => a.name.localeCompare(b.name))),
      getById: (id) => wait(tagById(id) ?? null),
      create: (data) => {
        const tag: Tag = { id: newId(), user_id: userId, name: data.name, color: data.color, created_at: now(), updated_at: now() };
        db.tags.push(tag);
        return wait(tag);
      },
      update: (id, updates) => wait(patch(db.tags, id, updates)),
      delete: (id) => {
        remove(db.tags, id);
        [db.linkTags, db.noteTags, db.taskTags].forEach((pairs) => {
          for (let i = pairs.length - 1; i >= 0; i -= 1) if (pairs[i][0] === id) pairs.splice(i, 1);
        });
        return wait(undefined);
      },
      getUsageCount: (tagId) => wait(db.links.filter((link) => link.tag_id === tagId).length),
    },

    spaces: {
      getAll: () => wait([...db.spaces].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))),
      getById: (id) => wait(db.spaces.find((space) => space.id === id) ?? null),
      create: (data) => {
        const space: Profile = { id: newId(), user_id: userId, name: data.name, created_at: now(), updated_at: now() };
        db.spaces.push(space);
        return wait(space);
      },
      update: (id, updates) => wait(patch(db.spaces, id, updates)),
      delete: (id) => {
        remove(db.spaces, id);
        db.spaceLinks = db.spaceLinks.filter((row) => row.profile_id !== id);
        db.spaceNotes = db.spaceNotes.filter((row) => row.profile_id !== id);
        db.spaceTasks = db.spaceTasks.filter((row) => row.profile_id !== id);
        return wait(undefined);
      },
    },

    jots: {
      getAll: () => wait([...db.jots].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))),
      create: (data) => {
        const saved = data.id ? db.jots.find((row) => row.id === data.id) : undefined;
        if (saved) return wait(saved);
        const jot: SelfMessage = {
          id: data.id ?? newId(),
          user_id: userId,
          profile_id: data.profile_id,
          body: data.body,
          created_at: now(),
          updated_at: now(),
        };
        db.jots.push(jot);
        return wait(jot);
      },
      update: (id, updates) => {
        const jot = db.jots.find((row) => row.id === id);
        if (!jot) return Promise.reject(new Error(`No jot ${id}`));
        if (updates.body !== undefined) jot.body = updates.body;
        if (updates.profile_id !== undefined) jot.profile_id = updates.profile_id;
        jot.updated_at = now();
        return wait(jot);
      },
      delete: (id) => {
        remove(db.jots, id);
        return wait(undefined);
      },
    },

    spaceLinks: {
      listMembership: () => wait(db.spaceLinks),
      setSuperFavorite: (spaceId, linkId, isSuperFavorite) => {
        const row = db.spaceLinks.find((entry) => entry.profile_id === spaceId && entry.link_id === linkId);
        if (row) row.is_super_favorite = isSuperFavorite;
        return wait(undefined);
      },
      getBySpace: (spaceId) =>
        wait(
          db.spaceLinks
            .filter((row) => row.profile_id === spaceId)
            .map((row, index): ProfileLink & { link?: LinkWithTag } => {
              const link = db.links.find((entry) => entry.id === row.link_id);
              return {
                id: `${spaceId}:${row.link_id}`,
                profile_id: spaceId,
                link_id: row.link_id,
                order_index: index,
                is_super_favorite: row.is_super_favorite,
                created_at: link?.created_at ?? now(),
                link: link ? withLinkTags(link) : undefined,
              };
            }),
        ),
      addLinks: (spaceId, linkIds) => {
        linkIds.forEach((linkId) => {
          if (!db.spaceLinks.some((row) => row.profile_id === spaceId && row.link_id === linkId)) {
            db.spaceLinks.push({ profile_id: spaceId, link_id: linkId });
          }
        });
        return wait(undefined);
      },
      removeLink: (spaceId, linkId) => {
        db.spaceLinks = db.spaceLinks.filter((row) => !(row.profile_id === spaceId && row.link_id === linkId));
        return wait(undefined);
      },
    },

    spaceNotes: {
      listMembership: () => wait(db.spaceNotes),
      addNotes: (spaceId, noteIds) => {
        noteIds.forEach((noteId) => {
          if (!db.spaceNotes.some((row) => row.profile_id === spaceId && row.note_id === noteId)) {
            db.spaceNotes.push({ profile_id: spaceId, note_id: noteId });
          }
        });
        return wait(undefined);
      },
      removeNote: (spaceId, noteId) => {
        db.spaceNotes = db.spaceNotes.filter((row) => !(row.profile_id === spaceId && row.note_id === noteId));
        return wait(undefined);
      },
    },

    spaceTasks: {
      listMembership: () => wait(db.spaceTasks),
      addTasks: (spaceId, taskIds) => {
        taskIds.forEach((taskId) => {
          if (!db.spaceTasks.some((row) => row.profile_id === spaceId && row.task_id === taskId)) {
            db.spaceTasks.push({ profile_id: spaceId, task_id: taskId });
          }
        });
        return wait(undefined);
      },
      removeTask: (spaceId, taskId) => {
        db.spaceTasks = db.spaceTasks.filter((row) => !(row.profile_id === spaceId && row.task_id === taskId));
        return wait(undefined);
      },
    },

    apiTokens: {
      getAll: () => wait([]),
      create: ({ name, token_hash }) =>
        wait({ id: newId(), user_id: userId, name, token_hash, created_at: now(), last_used_at: null }),
      delete: () => wait(undefined),
    },

    agentTokens: {
      getAll: () => wait([...(db.agentTokens ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))),
      revoke: (id) => {
        const token = db.agentTokens?.find((t) => t.id === id && !t.revoked_at);
        if (token) token.revoked_at = now();
        return wait(undefined);
      },
      revokeAll: () => {
        const live = (db.agentTokens ?? []).filter((t) => !t.revoked_at);
        live.forEach((t) => (t.revoked_at = now()));
        return wait(live.length);
      },
    },

    proposals: {
      getPending: () =>
        wait((db.proposals ?? []).filter((p) => p.status === 'pending').sort((a, b) => (a.created_at < b.created_at ? -1 : 1))),
      decide: (id, status) => {
        const proposal = db.proposals?.find((p) => p.id === id && p.status === 'pending');
        if (!proposal) return Promise.reject(new Error('This proposal was already decided'));
        proposal.status = status;
        proposal.decided_at = now();
        return wait(undefined);
      },
    },

    views: {
      getAll: () =>
        wait([...db.views].sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1))),
      create: ({ name, definition, position }) => {
        const view: SavedView = {
          id: newId(),
          user_id: userId,
          name,
          definition,
          position: position ?? 0,
          created_at: now(),
          updated_at: now(),
        };
        db.views.push(view);
        return wait(view);
      },
      update: (id, updates) => wait(patch(db.views, id, updates)),
      delete: (id) => {
        remove(db.views, id);
        return wait(undefined);
      },
    },

    projects: {
      getAll: () => wait<ProjectWithCounts[]>([]),
      getById: () => wait(null),
      create: (data) =>
        wait({
          id: newId(),
          user_id: userId,
          name: data.name,
          description: data.description,
          is_starred: data.is_starred ?? false,
          created_at: now(),
          updated_at: now(),
          last_modified: now(),
        }),
      update: (id, updates) =>
        wait({
          id,
          user_id: userId,
          name: updates.name ?? '',
          is_starred: updates.is_starred ?? false,
          created_at: now(),
          updated_at: now(),
          last_modified: now(),
        }),
      delete: () => wait(undefined),
    },
  };
};

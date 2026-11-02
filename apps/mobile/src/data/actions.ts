import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  getHostname,
  type ComposerResult,
  type InboxProposal,
  type LinkWithTag,
  type NoteWithTags,
  type Repository,
  type SelfMessage,
  type TaskWithTags,
} from '@memex/core';
import {
  createCaptureService,
  createRepositoryCaptureStore,
  parseCaptureInput,
  type CapturedLink,
  type PageMetadata,
} from '@memex/core/capture';
import { applyProposal, rejectProposal, type ProposalTarget } from '@memex/core/agent';
import { keys } from './keys';

/*
 * The Journal's writes, as plain functions over the Repository and the React
 * Query cache (no React, so they're unit-tested on the demo repository).
 * Every write shows up at once (optimistic rows with `temp-` ids, like the
 * web's hooks), is replaced by the saved row when the Repository answers, and
 * rolls back if it fails. Links go through core's capture service, so a link
 * saved here dedupes exactly like one from the extension and is marked
 * `captured_by: 'app'` with this client's name.
 */

export type FileableKind = 'link' | 'note' | 'task';
export type EntryKind = FileableKind | 'jot';
export type Composed = Exclude<ComposerResult, { kind: 'empty' }>;

export interface ComposeOutcome {
  kind: Composed['kind'];
  id: string;
  /** A link that was already saved (nothing new was created). */
  duplicate?: boolean;
  /** Spaces the item couldn't be filed in (it was saved anyway). */
  unfiled?: string[];
}

export interface ActionsDeps {
  queryClient: QueryClient;
  repository: Repository;
  /** `captured_client` for links saved here, e.g. `memex-ios/0.1.0`. */
  client: string;
  /** Page metadata for new links (the scraper); optional. */
  enrich?: (url: string) => Promise<PageMetadata>;
  now?: () => Date;
}

type Row = { id: string };
type MembershipRow = { profile_id: string } & Record<string, string>;

const MEMBERSHIP = {
  link: { key: keys.linkMembership, column: 'link_id' },
  note: { key: keys.noteMembership, column: 'note_id' },
  task: { key: keys.taskMembership, column: 'task_id' },
} as const;

const LIST = { jot: keys.jots, link: keys.links, note: keys.notes, task: keys.tasks } as const;

let seq = 0;
const tempId = () => `temp-${Date.now().toString(36)}-${(seq += 1)}`;

/** The favicon fallback the web uses when the scraper has none. */
export const faviconFor = (url: string) => {
  const host = getHostname(url).replace(/^www\./, '');
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : undefined;
};

const capturedToRow = (link: CapturedLink, base: LinkWithTag): LinkWithTag => ({
  ...base,
  id: link.id,
  url: link.url,
  title: link.title ?? undefined,
  description: link.description ?? undefined,
  favicon_url: link.favicon_url ?? undefined,
  preview_image_url: link.preview_image_url ?? undefined,
  source: link.source,
  source_id: link.source_id,
  lists: link.lists ?? [],
  captured_by: link.captured_by,
  captured_client: link.captured_client,
  url_key: link.url_key,
  created_at: link.created_at || base.created_at,
});

export const createJournalActions = ({ queryClient, repository, client, enrich, now = () => new Date() }: ActionsDeps) => {
  const list = <T extends Row>(key: QueryKey) => queryClient.getQueryData<T[]>(key);
  const setList = <T extends Row>(key: QueryKey, update: (rows: T[]) => T[]) =>
    queryClient.setQueryData<T[]>(key, (rows) => update(rows ?? []));
  const add = <T extends Row>(key: QueryKey, row: T) => setList<T>(key, (rows) => [...rows, row]);
  const drop = (key: QueryKey, id: string) => setList<Row>(key, (rows) => rows.filter((r) => r.id !== id));
  const swap = <T extends Row>(key: QueryKey, id: string, next: T) =>
    setList<T>(key, (rows) => (rows.some((r) => r.id === id) ? rows.map((r) => (r.id === id ? next : r)) : [...rows, next]));
  const settle = (...queryKeys: QueryKey[]) => Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const stamp = () => now().toISOString();

  /**
   * Change fields of one cached row at once, write it, and put just those
   * fields back if the write fails.
   */
  const patchRow = async <T extends Row>(key: QueryKey, id: string, changes: Partial<T>, write: () => Promise<unknown>) => {
    await queryClient.cancelQueries({ queryKey: key });
    const before = list<T>(key)?.find((r) => r.id === id);
    const previous = before
      ? (Object.fromEntries(Object.keys(changes).map((field) => [field, before[field as keyof T]])) as Partial<T>)
      : null;
    setList<T>(key, (rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    try {
      await write();
    } catch (error) {
      if (previous) setList<T>(key, (rows) => rows.map((r) => (r.id === id ? { ...r, ...previous } : r)));
      throw error;
    } finally {
      void settle(key);
    }
  };

  const memberRow = (kind: FileableKind, id: string, spaceId: string): MembershipRow =>
    ({ profile_id: spaceId, [MEMBERSHIP[kind].column]: id }) as MembershipRow;
  const isMember = (kind: FileableKind, id: string, spaceId: string) => (row: MembershipRow) =>
    row.profile_id === spaceId && row[MEMBERSHIP[kind].column] === id;
  const setMembers = (kind: FileableKind, update: (rows: MembershipRow[]) => MembershipRow[]) =>
    queryClient.setQueryData<MembershipRow[]>(MEMBERSHIP[kind].key, (rows) => update(rows ?? []));

  const addToSpace = (kind: FileableKind, spaceId: string, id: string) =>
    kind === 'link'
      ? repository.spaceLinks.addLinks(spaceId, [id])
      : kind === 'note'
        ? repository.spaceNotes.addNotes(spaceId, [id])
        : repository.spaceTasks.addTasks(spaceId, [id]);

  const removeFromSpace = (kind: FileableKind, spaceId: string, id: string) =>
    kind === 'link'
      ? repository.spaceLinks.removeLink(spaceId, id)
      : kind === 'note'
        ? repository.spaceNotes.removeNote(spaceId, id)
        : repository.spaceTasks.removeTask(spaceId, id);

  /** Optimistic membership rows for a new item, keyed by its temp id until it's saved. */
  const showFiled = (kind: FileableKind, id: string, spaceIds: string[]) =>
    setMembers(kind, (rows) => [...rows, ...spaceIds.map((s) => memberRow(kind, id, s))]);
  const renameFiled = (kind: FileableKind, from: string, to: string) => {
    const column = MEMBERSHIP[kind].column;
    setMembers(kind, (rows) => rows.map((r) => (r[column] === from ? { ...r, [column]: to } : r)));
  };
  const dropFiled = (kind: FileableKind, id: string) => {
    const column = MEMBERSHIP[kind].column;
    setMembers(kind, (rows) => rows.filter((r) => r[column] !== id));
  };

  /** File a freshly saved item; returns the spaces that failed (the item stays saved). */
  const fileNew = async (kind: FileableKind, id: string, spaceIds: string[]) => {
    const results = await Promise.allSettled(spaceIds.map((s) => addToSpace(kind, s, id)));
    const failed = spaceIds.filter((_, i) => results[i].status === 'rejected');
    failed.forEach((s) => setMembers(kind, (rows) => rows.filter((r) => !isMember(kind, id, s)(r))));
    await settle(MEMBERSHIP[kind].key);
    return failed;
  };

  /** Create a note or task with its filing shown at once. */
  const createItem = async <T extends Row>(
    kind: 'note' | 'task',
    temp: T,
    spaceIds: string[],
    create: () => Promise<T>,
  ): Promise<ComposeOutcome> => {
    await queryClient.cancelQueries({ queryKey: LIST[kind] });
    add(LIST[kind], temp);
    showFiled(kind, temp.id, spaceIds);
    let row: T;
    try {
      row = await create();
    } catch (error) {
      drop(LIST[kind], temp.id);
      dropFiled(kind, temp.id);
      throw error;
    }
    swap(LIST[kind], temp.id, row);
    renameFiled(kind, temp.id, row.id);
    const unfiled = await fileNew(kind, row.id, spaceIds);
    void settle(LIST[kind]);
    return { kind, id: row.id, unfiled: unfiled.length ? unfiled : undefined };
  };

  const captureLink = async (url: string, spaceIds: string[]): Promise<ComposeOutcome> => {
    const parsed = parseCaptureInput({ url, favicon: faviconFor(url) }, { defaultCapturedBy: 'app', defaultClient: client });
    if (!parsed.ok) throw new Error(parsed.error);
    const input = parsed.value;
    const at = stamp();
    const temp: LinkWithTag = {
      id: tempId(),
      user_id: '',
      project_id: 'pending',
      url: input.url,
      favicon_url: input.favicon ?? undefined,
      source: input.source,
      source_id: input.sourceId,
      captured_by: 'app',
      captured_client: client,
      created_at: at,
      updated_at: at,
      order_index: 0,
    };
    await queryClient.cancelQueries({ queryKey: keys.links });
    const cached = list<LinkWithTag>(keys.links);
    add(keys.links, temp);
    showFiled('link', temp.id, spaceIds);

    const capture = createCaptureService(
      createRepositoryCaptureStore(repository, { links: cached ? () => cached : undefined }),
      { enrich },
    );
    let result: Awaited<ReturnType<typeof capture.capture>>;
    try {
      result = await capture.capture(input);
    } catch (error) {
      drop(keys.links, temp.id);
      dropFiled('link', temp.id);
      throw error;
    }

    if (result.duplicate) {
      drop(keys.links, temp.id);
      dropFiled('link', temp.id);
      showFiled('link', result.link.id, spaceIds);
    } else {
      swap(keys.links, temp.id, capturedToRow(result.link, temp));
      renameFiled('link', temp.id, result.link.id);
    }
    const unfiled = await fileNew('link', result.link.id, spaceIds);
    void settle(keys.links);
    return { kind: 'link', id: result.link.id, duplicate: result.duplicate, unfiled: unfiled.length ? unfiled : undefined };
  };

  return {
    /** Save what the composer parsed: a jot, a link, a task or a note, filed in its @spaces. */
    async compose(result: Composed): Promise<ComposeOutcome> {
      const spaceIds = result.spaces.map((s) => s.id);
      const at = stamp();
      switch (result.kind) {
        case 'jot': {
          // A jot lives in one place: the first @space, else the Journal itself.
          const profile_id = spaceIds[0] ?? null;
          const temp: SelfMessage = { id: tempId(), user_id: '', profile_id, body: result.body, created_at: at, updated_at: at };
          await queryClient.cancelQueries({ queryKey: keys.jots });
          add(keys.jots, temp);
          try {
            const row = await repository.jots.create({ profile_id, body: result.body });
            swap(keys.jots, temp.id, row);
            return { kind: 'jot', id: row.id };
          } catch (error) {
            drop(keys.jots, temp.id);
            throw error;
          } finally {
            void settle(keys.jots);
          }
        }
        case 'task': {
          const temp: TaskWithTags = { id: tempId(), user_id: '', title: result.title, is_done: false, order_index: -1, created_at: at, updated_at: at };
          return createItem('task', temp, spaceIds, async () => ({ ...(await repository.tasks.create({ title: result.title })) }));
        }
        case 'note': {
          const temp: NoteWithTags = { id: tempId(), user_id: '', title: result.title, body: result.body, order_index: 0, created_at: at, updated_at: at };
          return createItem('note', temp, spaceIds, async () => ({ ...(await repository.notes.create({ title: result.title, body: result.body })) }));
        }
        case 'link':
          return captureLink(result.url, spaceIds);
      }
    },

    /**
     * Tick or untick a task. `updated_at` moves with it, so a task you just
     * ticked sorts first in Done (core's compareDoneTasks) before the refetch.
     */
    async setTaskDone(task: TaskWithTags, done: boolean) {
      if (task.id.startsWith('temp-')) return;
      await patchRow<TaskWithTags>(keys.tasks, task.id, { is_done: done, updated_at: stamp() }, () =>
        repository.tasks.update(task.id, { is_done: done }),
      );
    },

    /** Set a task's due date (a `YYYY-MM-DD` day), or clear it with null. */
    async setTaskDue(task: TaskWithTags, due: string | null) {
      if (task.id.startsWith('temp-')) return;
      await patchRow<TaskWithTags>(keys.tasks, task.id, { due_date: due ?? undefined }, () =>
        repository.tasks.update(task.id, { due_date: due }),
      );
    },

    /** Rename a task (one line, up to 200 characters, like the composer's tasks). */
    async renameTask(task: TaskWithTags, title: string) {
      const clean = title.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (task.id.startsWith('temp-') || !clean || clean === task.title) return;
      await patchRow<TaskWithTags>(keys.tasks, task.id, { title: clean }, () => repository.tasks.update(task.id, { title: clean }));
    },

    /**
     * Save a note's title and markdown. Plain text in, plain text stored
     * (notes stay portable); an empty title is stored as null, like the web.
     */
    async updateNote(note: NoteWithTags, changes: { title: string; body: string }) {
      if (note.id.startsWith('temp-')) return;
      const title = changes.title.trim();
      const at = stamp();
      await patchRow<NoteWithTags>(keys.notes, note.id, { title: title || undefined, body: changes.body, updated_at: at }, () =>
        repository.notes.update(note.id, { title: title || null, body: changes.body }),
      );
    },

    /**
     * Approve or reject an agent's Inbox proposal with core's applyProposal /
     * rejectProposal (the web Inbox's path). It leaves the list at once and
     * comes back if that fails; approving refreshes the item it changed.
     */
    async decideProposal(proposal: InboxProposal, target: ProposalTarget | null, decision: 'apply' | 'reject') {
      await queryClient.cancelQueries({ queryKey: keys.proposals });
      const before = list<InboxProposal>(keys.proposals);
      drop(keys.proposals, proposal.id);
      try {
        if (decision === 'apply') await applyProposal(repository, proposal, target);
        else await rejectProposal(repository, proposal);
      } catch (error) {
        if (before) queryClient.setQueryData(keys.proposals, before);
        throw error;
      } finally {
        const kind = proposal.item_type;
        void settle(keys.proposals, ...(decision === 'apply' ? [LIST[kind], MEMBERSHIP[kind].key] : []));
      }
    },

    /** File an item in a space (idempotent). */
    async file(kind: FileableKind, id: string, spaceId: string) {
      const already = (queryClient.getQueryData<MembershipRow[]>(MEMBERSHIP[kind].key) ?? []).some(isMember(kind, id, spaceId));
      if (!already) setMembers(kind, (rows) => [...rows, memberRow(kind, id, spaceId)]);
      try {
        await addToSpace(kind, spaceId, id);
      } catch (error) {
        if (!already) setMembers(kind, (rows) => rows.filter((r) => !isMember(kind, id, spaceId)(r)));
        throw error;
      } finally {
        void settle(MEMBERSHIP[kind].key);
      }
    },

    /** Take an item out of a space. */
    async unfile(kind: FileableKind, id: string, spaceId: string) {
      const rows = queryClient.getQueryData<MembershipRow[]>(MEMBERSHIP[kind].key) ?? [];
      const removed = rows.filter(isMember(kind, id, spaceId));
      setMembers(kind, (current) => current.filter((r) => !isMember(kind, id, spaceId)(r)));
      try {
        await removeFromSpace(kind, spaceId, id);
      } catch (error) {
        setMembers(kind, (current) => [...current, ...removed]);
        throw error;
      } finally {
        void settle(MEMBERSHIP[kind].key);
      }
    },

    /**
     * Delete for real (the Undo window is over; see deleteQueue.ts). The row
     * stays hidden by the queue until this settles, then the caches refetch.
     */
    async remove(kind: EntryKind, id: string) {
      if (id.startsWith('temp-')) return;
      if (kind === 'jot') await repository.jots.delete(id);
      else if (kind === 'link') await repository.links.delete(id);
      else if (kind === 'note') await repository.notes.delete(id);
      else await repository.tasks.delete(id);
      drop(LIST[kind], id);
      if (kind !== 'jot') dropFiled(kind, id);
      await settle(LIST[kind], ...(kind === 'jot' ? [] : [MEMBERSHIP[kind].key]));
    },
  };
};

export type JournalActions = ReturnType<typeof createJournalActions>;

/** `link:abc` → `{ kind: 'link', id: 'abc' }` (entry ids are stream item keys). */
export const parseEntryId = (entryId: string): { kind: EntryKind; id: string } => {
  const at = entryId.indexOf(':');
  return { kind: entryId.slice(0, at) as EntryKind, id: entryId.slice(at + 1) };
};

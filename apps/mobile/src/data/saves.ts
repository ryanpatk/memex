import {
  createOutbox,
  isTransientError,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStorage,
} from '@memex/core';
import type { ComposeOutcome, Composed, JournalActions } from './actions';

/*
 * Every save from the composer and the share sheet goes through here. It's
 * tried at once (optimistic, as before); if the phone can't reach Supabase,
 * it goes into core's outbox on the device instead of being lost, and the
 * outbox sends it later through the same actions.compose. The id is chosen
 * here, before the first try, so a retry can't make a second copy: jots,
 * notes and tasks are created with it, and links dedupe through the capture
 * service against the server's links.
 */

export type SaveResult = { queued: false; outcome: ComposeOutcome } | { queued: true; item: OutboxItem };

/** The composer's result as an outbox draft (spaces keep their names, for the pending row). */
export const toDraft = (result: Composed): OutboxDraft => {
  const spaces = result.spaces.map(({ id, name }) => ({ id, name }));
  switch (result.kind) {
    case 'jot':
      return { kind: 'jot', body: result.body, spaces };
    case 'task':
      return { kind: 'task', title: result.title, spaces };
    case 'note':
      return { kind: 'note', title: result.title, body: result.body, spaces };
    case 'link':
      return {
        kind: 'link',
        url: result.url,
        ...(result.title ? { title: result.title } : {}),
        ...(result.note ? { note: result.note } : {}),
        ...(result.capturedBy ? { capturedBy: result.capturedBy } : {}),
        spaces,
      };
  }
};

export const fromDraft = (draft: OutboxDraft): Composed => {
  const spaces = draft.spaces.map(({ id, name }) => ({ id, name }));
  switch (draft.kind) {
    case 'jot':
      return { kind: 'jot', body: draft.body, spaces };
    case 'task':
      return { kind: 'task', title: draft.title, spaces };
    case 'note':
      return { kind: 'note', title: draft.title, body: draft.body, spaces };
    case 'link':
      return { kind: 'link', url: draft.url, title: draft.title, note: draft.note, capturedBy: draft.capturedBy, spaces };
  }
};

export interface SavesDeps {
  actions: JournalActions;
  /** A fresh UUID (expo-crypto's randomUUID). */
  newId: () => string;
  storage?: OutboxStorage;
  isTransient?: (error: unknown) => boolean;
  now?: () => number;
  onStorageError?: (error: unknown) => void;
}

export const createSaves = ({ actions, newId, storage, isTransient = isTransientError, now, onStorageError }: SavesDeps) => {
  let owner: string | null = null;
  const ownerListeners = new Set<() => void>();
  const outbox = createOutbox<ComposeOutcome>({
    storage,
    isTransient,
    now,
    onStorageError,
    // Same path as a first try; jots keep the time they were written.
    send: (item) => actions.compose(fromDraft(item.draft), { id: item.id, retry: true, createdAt: item.queuedAt }),
  });

  return {
    outbox,

    /** The signed-in user; queued saves are theirs, and only theirs get sent. */
    setOwner(next: string | null) {
      if (next === owner) return;
      owner = next;
      ownerListeners.forEach((listener) => listener());
    },
    owner: () => owner,
    subscribeOwner(listener: () => void) {
      ownerListeners.add(listener);
      return () => {
        ownerListeners.delete(listener);
      };
    },

    /**
     * Save now, or keep it on the phone when offline (resolves either way).
     * Anything else (the server said no) rejects, as before.
     */
    async save(result: Composed): Promise<SaveResult> {
      const id = newId();
      const queuedAt = new Date(now?.() ?? Date.now()).toISOString();
      try {
        return { queued: false, outcome: await actions.compose(result, { id }) };
      } catch (error) {
        if (!isTransient(error)) throw error;
        return { queued: true, item: outbox.enqueue(toDraft(result), { id, owner, error, queuedAt }) };
      }
    },

    /** Send what's due for the signed-in user. */
    flush: (force = false) => (owner ? outbox.flush({ force, owner }) : Promise.resolve({ sent: [], failed: [], waiting: 0 })),
    retry: (id: string) => outbox.retry(id, { owner }),
    discard: (id: string) => outbox.discard(id),
    restore: (item: OutboxItem) => outbox.restore(item),
  };
};

export type Saves = ReturnType<typeof createSaves>;

/** Words for a queued save: what it is, for its row and toasts. */
export const draftText = (draft: OutboxDraft) => {
  switch (draft.kind) {
    case 'jot':
      return draft.body;
    case 'task':
      return draft.title;
    case 'note':
      return draft.title || draft.body;
    case 'link':
      return draft.title || draft.url;
  }
};

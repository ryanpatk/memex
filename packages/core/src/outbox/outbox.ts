/*
 * The capture outbox: saves made on a device that couldn't reach the server
 * yet (CONTEXT.md → Change: devices queue them in an outbox). v1 holds new
 * entries only (a jot, a link, a note or a task, with the spaces to file it
 * in); v2's outbox carries every Change to the vault writer.
 *
 * It's runtime-neutral: the client gives it a storage port (AsyncStorage on
 * the phone) and a `send` that performs the save. Each item keeps the id it
 * was first tried with, and `send` must be idempotent per id (core's
 * Repository returns the saved row when a jot, note or task is created again
 * with the same id; links dedupe through the capture service), so a retry
 * after a lost response never makes a second copy.
 *
 * Retries: a transient failure (offline, a timeout, a 5xx) keeps the item
 * waiting with exponential backoff and stops the round, since the rest would
 * fail the same way. Any other failure parks the item as `failed` with the
 * reason until someone retries or discards it. Discarding only drops the
 * local copy; nothing on the server is touched.
 */
import type { CapturedBy } from '../capture/input';
import { getErrorMessage, isTransientError } from '../errors';

export interface OutboxSpace {
  id: string;
  name: string;
}

/** What to save. The shapes follow core's ComposerResult; links may carry what a share sheet knows. */
export type OutboxDraft =
  | { kind: 'jot'; body: string; spaces: OutboxSpace[] }
  | { kind: 'task'; title: string; spaces: OutboxSpace[] }
  | { kind: 'note'; title: string; body: string; spaces: OutboxSpace[] }
  | {
      kind: 'link';
      url: string;
      /** The page title the sharing app gave, if any. */
      title?: string | null;
      /** Why it was saved (stored as the description, per the capture rules). */
      note?: string | null;
      capturedBy?: CapturedBy;
      spaces: OutboxSpace[];
    };

/** `waiting`: will be sent automatically · `sending`: in flight · `failed`: the server said no; needs Retry or Discard. */
export type OutboxStatus = 'waiting' | 'sending' | 'failed';

export interface OutboxItem {
  /** Chosen when the save was first tried; jots, notes and tasks are created with it. */
  id: string;
  draft: OutboxDraft;
  /** The user it was saved by. Only sent while they're signed in; null = whoever is. */
  owner: string | null;
  /** ISO time it was first tried. */
  queuedAt: string;
  /** Failed tries so far. */
  attempts: number;
  status: OutboxStatus;
  /** Epoch ms of the next automatic try (waiting items). */
  nextAttemptAt: number;
  /** The last failure, in words. */
  lastError: string | null;
}

/** Where the outbox persists (one string). */
export interface OutboxStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export interface OutboxOptions<R> {
  storage?: OutboxStorage;
  /** Perform the save. Must be idempotent per `item.id`. */
  send: (item: OutboxItem) => Promise<R>;
  /** Which failures are worth retrying automatically (default: isTransientError). */
  isTransient?: (error: unknown) => boolean;
  now?: () => number;
  /** Retry delays: base × 2^(tries − 1), capped, ±25% jitter. Defaults 5 s and 10 min. */
  backoff?: { baseMs?: number; maxMs?: number };
  random?: () => number;
  /** Most items kept; enqueue throws OutboxFullError past it (default 500). */
  limit?: number;
  /** Persistence failures (the in-memory queue keeps working). */
  onStorageError?: (error: unknown) => void;
}

export interface FlushOptions {
  /** Ignore backoff (the app came to the foreground, the connection came back, Retry). */
  force?: boolean;
  /** The signed-in user: only their items (and ownerless ones) are sent. */
  owner?: string | null;
}

export interface FlushResult<R> {
  sent: { item: OutboxItem; result: R }[];
  failed: OutboxItem[];
  /** Still waiting (offline, or not due yet). */
  waiting: number;
}

export class OutboxFullError extends Error {
  constructor(limit: number) {
    super(`The outbox is full (${limit} saves are waiting)`);
    this.name = 'OutboxFullError';
  }
}

const STORAGE_VERSION = 1;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

const isSpaces = (value: unknown): value is OutboxSpace[] =>
  Array.isArray(value) && value.every((s) => isObject(s) && isString(s.id) && isString(s.name));

/** A stored draft, checked field by field (storage is outside our control). */
export const isOutboxDraft = (value: unknown): value is OutboxDraft => {
  if (!isObject(value) || !isSpaces(value.spaces)) return false;
  switch (value.kind) {
    case 'jot':
      return isString(value.body);
    case 'task':
      return isString(value.title);
    case 'note':
      return isString(value.title) && isString(value.body);
    case 'link':
      return isString(value.url) && (value.title == null || isString(value.title)) && (value.note == null || isString(value.note));
    default:
      return false;
  }
};

const reviveItem = (value: unknown): OutboxItem | null => {
  if (!isObject(value) || !isString(value.id) || !value.id || !isOutboxDraft(value.draft) || !isString(value.queuedAt)) return null;
  const status: OutboxStatus = value.status === 'failed' ? 'failed' : 'waiting'; // `sending` when the app was killed mid-send
  return {
    id: value.id,
    draft: value.draft,
    owner: isString(value.owner) ? value.owner : null,
    queuedAt: value.queuedAt,
    attempts: typeof value.attempts === 'number' && value.attempts >= 0 ? Math.floor(value.attempts) : 0,
    status,
    nextAttemptAt: typeof value.nextAttemptAt === 'number' ? value.nextAttemptAt : 0,
    lastError: isString(value.lastError) ? value.lastError : null,
  };
};

/** Read what `serializeOutbox` wrote; anything unreadable is dropped item by item. */
export const parseStoredOutbox = (raw: string | null): OutboxItem[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
    const seen = new Set<string>();
    return parsed.items.flatMap((value) => {
      const item = reviveItem(value);
      if (!item || seen.has(item.id)) return [];
      seen.add(item.id);
      return [item];
    });
  } catch {
    return [];
  }
};

export const serializeOutbox = (items: readonly OutboxItem[]) => JSON.stringify({ version: STORAGE_VERSION, items });

/** The wait before try number `attempts + 1`. */
export const backoffDelay = (attempts: number, { baseMs = 5_000, maxMs = 600_000 } = {}, random: () => number = Math.random) => {
  const raw = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
  return Math.round(raw * (0.75 + random() * 0.5));
};

const byQueuedAt = (a: OutboxItem, b: OutboxItem) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0);

export const createOutbox = <R>({
  storage,
  send,
  isTransient = isTransientError,
  now = Date.now,
  backoff,
  random = Math.random,
  limit = 500,
  onStorageError,
}: OutboxOptions<R>) => {
  let items: OutboxItem[] = [];
  let snapshot: readonly OutboxItem[] = [];
  const listeners = new Set<() => void>();
  let writing: Promise<void> = Promise.resolve();
  let loading: Promise<void> | null = null;
  let running: Promise<FlushResult<R>> | null = null;
  let again: FlushOptions | null = null;

  const changed = () => {
    snapshot = [...items].sort(byQueuedAt);
    listeners.forEach((listener) => listener());
    if (storage) {
      const value = serializeOutbox(snapshot);
      writing = writing.then(() => storage.write(value)).catch((error) => onStorageError?.(error));
    }
  };

  const find = (id: string) => items.find((item) => item.id === id);
  const update = (id: string, changes: Partial<OutboxItem>) => {
    items = items.map((item) => (item.id === id ? { ...item, ...changes } : item));
    changed();
  };
  const ownedBy = (owner: string | null | undefined) => (item: OutboxItem) =>
    owner === undefined || item.owner === null || item.owner === owner;

  const load = () => {
    loading ??= (async () => {
      let stored: OutboxItem[] = [];
      try {
        stored = parseStoredOutbox((await storage?.read()) ?? null);
      } catch (error) {
        onStorageError?.(error);
      }
      // Anything enqueued before loading finished wins over its stored copy.
      const fresh = new Set(items.map((item) => item.id));
      const restored = stored.filter((item) => !fresh.has(item.id));
      if (restored.length) {
        items = [...restored, ...items];
        changed();
      }
    })();
    return loading;
  };

  const runOnce = async ({ force = false, owner }: FlushOptions, result: FlushResult<R>) => {
    const due = items
      .filter((item) => item.status === 'waiting' && (force || item.nextAttemptAt <= now()) && ownedBy(owner)(item))
      .sort(byQueuedAt);
    for (const candidate of due) {
      const item = find(candidate.id);
      if (!item || item.status !== 'waiting') continue; // discarded or changed meanwhile
      update(item.id, { status: 'sending' });
      try {
        const sent = await send(item);
        items = items.filter((i) => i.id !== item.id);
        changed();
        result.sent.push({ item, result: sent });
      } catch (error) {
        if (!find(item.id)) continue;
        const attempts = item.attempts + 1;
        const lastError = getErrorMessage(error) || 'Something went wrong';
        if (isTransient(error)) {
          update(item.id, { status: 'waiting', attempts, lastError, nextAttemptAt: now() + backoffDelay(attempts, backoff, random) });
          break; // still offline: the rest would fail the same way
        }
        update(item.id, { status: 'failed', attempts, lastError });
        result.failed.push(find(item.id)!);
      }
    }
  };

  const outbox = {
    /** Read the stored queue (call once at launch; flush waits for it). */
    load,

    /** Every item, oldest first (a stable array between changes, for useSyncExternalStore). */
    items: (): readonly OutboxItem[] => snapshot,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /**
     * Keep a save that couldn't be sent. Pass the id it was first tried with
     * (so the retry can't duplicate it) and, if a try already failed, the
     * error (it counts as the first try and sets the backoff). Enqueueing an
     * id that's already queued returns the queued item.
     */
    enqueue(draft: OutboxDraft, { id, owner = null, error, queuedAt }: { id: string; owner?: string | null; error?: unknown; queuedAt?: string }) {
      const existing = find(id);
      if (existing) return existing;
      if (items.length >= limit) throw new OutboxFullError(limit);
      const attempts = error === undefined ? 0 : 1;
      const item: OutboxItem = {
        id,
        draft,
        owner,
        queuedAt: queuedAt ?? new Date(now()).toISOString(),
        attempts,
        status: 'waiting',
        nextAttemptAt: attempts ? now() + backoffDelay(attempts, backoff, random) : now(),
        lastError: error === undefined ? null : getErrorMessage(error) || 'Something went wrong',
      };
      items = [...items, item];
      changed();
      return item;
    },

    /**
     * Send what's due, oldest first, one at a time. Concurrent calls share
     * one run (a call made during a run triggers one more pass after it).
     */
    flush(options: FlushOptions = {}): Promise<FlushResult<R>> {
      if (running) {
        again = { force: Boolean(again?.force || options.force), owner: options.owner ?? again?.owner };
        return running;
      }
      running = (async () => {
        await (loading ?? Promise.resolve());
        const result: FlushResult<R> = { sent: [], failed: [], waiting: 0 };
        let next: FlushOptions | null = options;
        while (next) {
          again = null;
          await runOnce(next, result);
          next = again;
        }
        result.waiting = items.filter((item) => item.status !== 'failed').length;
        return result;
      })().finally(() => {
        running = null;
      });
      return running;
    },

    /** Try one item again now (a failed one too). */
    retry(id: string, options: { owner?: string | null } = {}) {
      const item = find(id);
      if (!item || item.status === 'sending') return running ?? outbox.flush(options);
      update(id, { status: 'waiting', nextAttemptAt: 0 });
      return outbox.flush({ owner: options.owner });
    },

    /**
     * Drop the local copy (never touches the server). Returns the item, for
     * Undo through `restore`; null if it's mid-send or already gone.
     */
    discard(id: string): OutboxItem | null {
      const item = find(id);
      if (!item || item.status === 'sending') return null;
      items = items.filter((i) => i.id !== id);
      changed();
      return item;
    },

    /** Put a discarded item back (Undo). */
    restore(item: OutboxItem) {
      if (find(item.id)) return;
      items = [...items, { ...item, status: item.status === 'sending' ? 'waiting' : item.status }];
      changed();
    },

    /** When the next waiting item is due (epoch ms), for a retry timer; null if none. */
    nextDueAt(owner?: string | null): number | null {
      const waiting = items.filter((item) => item.status === 'waiting' && ownedBy(owner)(item));
      return waiting.length ? Math.min(...waiting.map((item) => item.nextAttemptAt)) : null;
    },

    /** Resolves when everything written so far is in storage. */
    settled: () => writing,
  };
  return outbox;
};

export type Outbox<R = unknown> = ReturnType<typeof createOutbox<R>>;

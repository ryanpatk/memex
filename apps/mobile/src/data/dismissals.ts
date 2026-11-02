/*
 * Dismissed filing suggestions (the Inbox's “Not now”). Core's filer
 * suggests a space for recent unfiled items (decision 13); dismissing one
 * hides that suggestion on this phone: in the Inbox, under the entry in the
 * feed and on link detail. Unfiled stays a finished state, so nothing about
 * the item changes. Device-local by design (no schema change in v1): the
 * set lives in AsyncStorage, keyed by entry id (`link:<uuid>`), and entries
 * older than the Inbox's window are pruned. Plain TS; the app injects the
 * storage, tests use a map.
 */

export interface DismissalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const DISMISSALS_KEY = 'memex.inbox.dismissed.v1';
/** Longer than the Inbox's 30-day window, so a dismissed chip doesn't come back in the feed soon after. */
const KEEP_MS = 90 * 86_400_000;
const MAX = 500;

type Stored = Record<string, string>;

/** Stored JSON → the dismissals still worth keeping (newest MAX, none older than KEEP_MS). Forgiving. */
export const parseDismissals = (raw: string | null, now: Date): Stored => {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cutoff = now.getTime() - KEEP_MS;
  const kept = Object.entries(value as Record<string, unknown>)
    .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && Date.parse(pair[1]) >= cutoff)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, MAX);
  return Object.fromEntries(kept);
};

export interface Dismissals {
  subscribe: (listener: () => void) => () => void;
  /** The dismissed entry ids (a new Set on every change, so it works as a snapshot). */
  current: () => ReadonlySet<string>;
  dismiss: (entryId: string) => void;
  /** Undo a dismissal. */
  restore: (entryId: string) => void;
  /** Read what an earlier session stored. */
  load: () => Promise<void>;
}

export const createDismissals = ({
  storage,
  now = () => new Date(),
}: {
  storage?: DismissalStorage;
  now?: () => Date;
} = {}): Dismissals => {
  let stored: Stored = {};
  let ids: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  // Until the stored set is read, writing would overwrite it: changes wait for load().
  let loaded = !storage;
  let unsaved = false;

  const publish = (next: Stored, persist: boolean) => {
    stored = next;
    ids = new Set(Object.keys(next));
    listeners.forEach((listener) => listener());
    if (!persist || !storage) return;
    if (!loaded) {
      unsaved = true;
      return;
    }
    storage.setItem(DISMISSALS_KEY, JSON.stringify(next)).catch((error: unknown) => console.warn('Couldn’t store dismissals:', error));
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => ids,
    dismiss(entryId) {
      if (stored[entryId]) return;
      publish(parseDismissals(JSON.stringify({ ...stored, [entryId]: now().toISOString() }), now()), true);
    },
    restore(entryId) {
      if (!stored[entryId]) return;
      const next = { ...stored };
      delete next[entryId];
      publish(next, true);
    },
    async load() {
      if (!storage || loaded) return;
      let earlier: Stored = {};
      try {
        earlier = parseDismissals(await storage.getItem(DISMISSALS_KEY), now());
      } catch (error) {
        console.warn('Couldn’t read dismissals:', error);
      }
      loaded = true;
      // Anything dismissed while loading is kept, and saved with the rest.
      publish({ ...earlier, ...stored }, unsaved);
      unsaved = false;
    },
  };
};

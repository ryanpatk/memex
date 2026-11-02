/*
 * Delete with Undo (web: JournalPage's pending deletes). Deleting hides the
 * entry at once and starts a timer; Undo inside the window brings it back
 * and nothing is written. When the window ends the real delete runs, and the
 * entry stays hidden until it settles (a refetch mid-delete can't flash it
 * back). If the delete fails, the entry reappears and `onError` is told.
 * Plain TS with a subscribe/snapshot pair for useSyncExternalStore.
 */

export const UNDO_WINDOW_MS = 6000;

export interface DeleteQueue {
  /** Hide `key` and delete it after the window. Returns Undo (false once too late). */
  schedule(key: string): () => boolean;
  /** Run every pending delete now (e.g. the app is going to the background). */
  flush(): void;
  hidden(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
}

export const createDeleteQueue = ({
  commit,
  onError,
  windowMs = UNDO_WINDOW_MS,
}: {
  commit: (key: string) => Promise<void>;
  onError?: (key: string, error: unknown) => void;
  windowMs?: number;
}): DeleteQueue => {
  let hidden: ReadonlySet<string> = new Set();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const setHidden = (key: string, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.add(key);
    else next.delete(key);
    hidden = next;
    emit();
  };

  const run = (key: string) => {
    timers.delete(key);
    commit(key)
      .catch((error) => onError?.(key, error))
      .finally(() => setHidden(key, false));
  };

  return {
    schedule(key) {
      if (timers.has(key)) return () => false;
      setHidden(key, true);
      timers.set(
        key,
        setTimeout(() => run(key), windowMs),
      );
      return () => {
        const timer = timers.get(key);
        if (!timer) return false;
        clearTimeout(timer);
        timers.delete(key);
        setHidden(key, false);
        return true;
      };
    },
    flush() {
      [...timers].forEach(([key, timer]) => {
        clearTimeout(timer);
        run(key);
      });
    },
    hidden: () => hidden,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

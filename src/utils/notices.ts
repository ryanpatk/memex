/*
 * App-wide toast plumbing, kept out of React so it can be tested and called
 * from anywhere (the QueryClient's MutationCache lives outside the tree).
 *
 * - `notices`: messages for the signed-in shell's own toast (MemexShell →
 *   ShellNotices), e.g. the fallback for a failed write nobody else reported.
 * - `toastShown`: every useFeedbackToast announces when it shows a toast, and
 *   the others step aside, so only one toast is on screen at a time (they all
 *   sit in the same bottom-right corner).
 */

export interface Channel<T> {
  publish: (value: T) => void;
  /** Returns the unsubscribe function. */
  subscribe: (listener: (value: T) => void) => () => void;
}

/** A tiny synchronous pub/sub. Listeners added or removed mid-publish don't affect that publish. */
export function createChannel<T>(): Channel<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    publish: (value) => {
      Array.from(listeners).forEach((listener) => listener(value));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const notices = createChannel<string>();

export const toastShown = createChannel<symbol>();

/*
 * What a page shows while its reads load: a skeleton, the content (or its
 * real empty state), or "Couldn't load…" with Retry. Plain TS over React
 * Query's status fields so it can be tested without a DOM.
 */

export type LoadState = 'loading' | 'ready' | 'failed';

/** The fields of a React Query result this needs (UseQueryResult has them all). */
export interface QueryStatusLike {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  data: unknown;
}

/**
 * Data on screen (fetched, or restored from the persisted cache) always wins
 * over a failed refetch. Without data, an error fails the page, and so does a
 * fetch paused for being offline (it would otherwise read as an empty
 * account). Pass enabled queries only: a disabled one stays pending.
 */
export function loadStateOf(queries: readonly QueryStatusLike[]): LoadState {
  const empty = queries.filter((query) => query.data === undefined);
  if (empty.some((query) => query.status === 'error' || query.fetchStatus === 'paused')) return 'failed';
  if (queries.some((query) => query.status === 'pending')) return 'loading';
  return 'ready';
}

/** Copy for a page that couldn't load, e.g. `loadErrorCopy('your Journal', navigator.onLine)`. */
export function loadErrorCopy(what: string, online: boolean): { title: string; subtitle: string } {
  return {
    title: `Couldn’t load ${what}`,
    subtitle: online
      ? 'Something went wrong on the way. Try again in a moment.'
      : 'You’re offline. Reconnect, then try again.',
  };
}

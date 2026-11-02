/** Safe message string for unknown thrown values (Supabase, fetch, etc.). */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
  }
  return '';
}

/** A Postgres unique violation (PostgREST reports it as code 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown } | null;
  return e?.code === '23505' || getErrorMessage(error).includes('duplicate key');
}

// What fetch, supabase-js and React Native say when the server can't be
// reached: no connection, DNS, a dropped or refused connection, a timeout.
const UNREACHABLE =
  /network request failed|failed to fetch|fetch failed|networkerror|load failed|network connection was lost|internet connection appears to be offline|not connected to the internet|timed? ?out|socket hang up|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/i;

const TRANSIENT_NAMES = new Set(['AbortError', 'TimeoutError', 'AuthRetryableFetchError']);

/**
 * True when a request failed because the server couldn't be reached
 * (offline, a dropped connection, a timeout) or answered with a passing
 * error (HTTP 408, 429 or 5xx), so the same write may work later. False for
 * answers that would fail again: validation, permissions, not signed in.
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; status?: unknown; code?: unknown; details?: unknown };
  if (typeof e.name === 'string' && TRANSIENT_NAMES.has(e.name)) return true;
  if (typeof e.status === 'number' && (e.status === 408 || e.status === 429 || e.status >= 500)) return true;
  if (typeof e.code === 'string' && /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH)$/.test(e.code)) return true;
  const details = typeof e.details === 'string' ? e.details : '';
  return UNREACHABLE.test(getErrorMessage(error)) || UNREACHABLE.test(details.split('\n')[0] ?? '');
}

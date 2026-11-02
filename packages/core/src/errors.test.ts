import { describe, expect, it } from 'vitest';
import { isTransientError, isUniqueViolation } from './errors';

describe('isTransientError', () => {
  it('knows the ways a request fails without reaching the server', () => {
    expect(isTransientError(new TypeError('Network request failed'))).toBe(true); // React Native
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true); // browsers
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true); // Node
    expect(isTransientError(new TypeError('Load failed'))).toBe(true); // Safari
    // postgrest-js wraps a fetch failure as a plain object
    expect(isTransientError({ message: 'TypeError: Network request failed', details: 'TypeError: Network request failed\n  at …', hint: '', code: '' })).toBe(true);
    expect(isTransientError({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toBe(true);
    expect(isTransientError(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isTransientError({ message: 'getaddrinfo ENOTFOUND x.supabase.co', code: 'ENOTFOUND' })).toBe(true);
  });

  it('retries passing server trouble', () => {
    expect(isTransientError({ message: 'Bad gateway', status: 502 })).toBe(true);
    expect(isTransientError({ message: 'Too many requests', status: 429 })).toBe(true);
  });

  it('does not retry answers that would fail again', () => {
    expect(isTransientError(new Error('User not authenticated'))).toBe(false);
    expect(isTransientError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false);
    expect(isTransientError({ message: 'Bad request', status: 400 })).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError('offline')).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('reads Postgres code 23505 and its message', () => {
    expect(isUniqueViolation({ code: '23505', message: 'x' })).toBe(true);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint "tasks_pkey"'))).toBe(true);
    expect(isUniqueViolation({ code: '42501' })).toBe(false);
  });
});

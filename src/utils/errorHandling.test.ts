import { describe, expect, it, vi } from 'vitest';
import { loadErrorCopy, loadStateOf, type QueryStatusLike } from './loadState';
import {
  HANDLES_ERRORS,
  MUTATION_ERROR_MESSAGE,
  OFFLINE_MUTATION_ERROR_MESSAGE,
  errorMeta,
  mutationErrorMessage,
  shouldReportMutationError,
} from './mutationErrors';
import { createChannel } from './notices';

const query = (overrides: Partial<QueryStatusLike>): QueryStatusLike => ({
  status: 'success',
  fetchStatus: 'idle',
  data: [],
  ...overrides,
});

describe('loadStateOf', () => {
  it('is ready once every query has data', () => {
    expect(loadStateOf([query({}), query({ fetchStatus: 'fetching' })])).toBe('ready');
  });

  it('is loading while a query has nothing yet', () => {
    expect(loadStateOf([query({}), query({ status: 'pending', fetchStatus: 'fetching', data: undefined })])).toBe('loading');
  });

  it('fails when a query errored with nothing to show', () => {
    expect(loadStateOf([query({}), query({ status: 'error', data: undefined })])).toBe('failed');
  });

  it('fails when a cold fetch is paused offline (not an empty account)', () => {
    expect(loadStateOf([query({ status: 'pending', fetchStatus: 'paused', data: undefined })])).toBe('failed');
  });

  it('keeps showing cached data when a refetch fails or pauses', () => {
    expect(loadStateOf([query({ status: 'error' }), query({ fetchStatus: 'paused' })])).toBe('ready');
  });

  it('a failure beats another query still loading', () => {
    expect(
      loadStateOf([
        query({ status: 'pending', fetchStatus: 'fetching', data: undefined }),
        query({ status: 'error', data: undefined }),
      ]),
    ).toBe('failed');
  });

  it('is ready with no queries', () => {
    expect(loadStateOf([])).toBe('ready');
  });
});

describe('loadErrorCopy', () => {
  it('names what failed and says to try again', () => {
    expect(loadErrorCopy('your Journal', true)).toEqual({
      title: 'Couldn’t load your Journal',
      subtitle: 'Something went wrong on the way. Try again in a moment.',
    });
  });

  it('says so when the browser is offline', () => {
    expect(loadErrorCopy('your tasks', false).subtitle).toBe('You’re offline. Reconnect, then try again.');
  });
});

describe('mutation error rule', () => {
  it('reports a failed mutation by default', () => {
    expect(shouldReportMutationError(undefined)).toBe(true);
    expect(shouldReportMutationError({})).toBe(true);
    expect(shouldReportMutationError({ handlesErrors: false })).toBe(true);
  });

  it('stays quiet for a mutation whose caller handles errors', () => {
    expect(shouldReportMutationError(errorMeta(HANDLES_ERRORS))).toBe(false);
  });

  it('hooks without options pass no meta', () => {
    expect(errorMeta()).toBeUndefined();
    expect(errorMeta({})).toBeUndefined();
  });

  it('words the fallback for online and offline', () => {
    expect(mutationErrorMessage(true)).toBe(MUTATION_ERROR_MESSAGE);
    expect(mutationErrorMessage(false)).toBe(OFFLINE_MUTATION_ERROR_MESSAGE);
    expect(MUTATION_ERROR_MESSAGE).toBe('Couldn’t save that change. Check your connection and try again.');
  });
});

describe('createChannel', () => {
  it('delivers to every subscriber until it unsubscribes', () => {
    const channel = createChannel<string>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = channel.subscribe(a);
    channel.subscribe(b);
    channel.publish('one');
    offA();
    channel.publish('two');
    expect(a.mock.calls).toEqual([['one']]);
    expect(b.mock.calls).toEqual([['one'], ['two']]);
  });

  it('a listener that unsubscribes another mid-publish does not skip it this time', () => {
    const channel = createChannel<number>();
    const seen: string[] = [];
    let offSecond = () => {};
    channel.subscribe(() => {
      seen.push('first');
      offSecond();
    });
    offSecond = channel.subscribe(() => seen.push('second'));
    channel.publish(1);
    channel.publish(2);
    expect(seen).toEqual(['first', 'second', 'first']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeleteQueue } from './deleteQueue';

describe('delete queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides at once and deletes after the window', async () => {
    const commit = vi.fn(() => Promise.resolve());
    const queue = createDeleteQueue({ commit, windowMs: 6000 });
    const seen: number[] = [];
    queue.subscribe(() => seen.push(queue.hidden().size));
    queue.schedule('jot:j1');
    expect(queue.hidden().has('jot:j1')).toBe(true);
    await vi.advanceTimersByTimeAsync(5999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledWith('jot:j1');
    await vi.runAllTimersAsync();
    expect(queue.hidden().size).toBe(0);
    expect(seen).toEqual([1, 0]);
  });

  it('Undo inside the window writes nothing; too late returns false', async () => {
    const commit = vi.fn(() => Promise.resolve());
    const queue = createDeleteQueue({ commit, windowMs: 6000 });
    const undo = queue.schedule('task:t2');
    expect(undo()).toBe(true);
    expect(queue.hidden().size).toBe(0);
    await vi.advanceTimersByTimeAsync(7000);
    expect(commit).not.toHaveBeenCalled();
    const late = queue.schedule('task:t3');
    await vi.advanceTimersByTimeAsync(6000);
    expect(late()).toBe(false);
  });

  it('brings the entry back and reports when the delete fails', async () => {
    const onError = vi.fn();
    const queue = createDeleteQueue({ commit: () => Promise.reject(new Error('offline')), onError, windowMs: 10 });
    queue.schedule('link:l1');
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith('link:l1', expect.any(Error));
    expect(queue.hidden().size).toBe(0);
  });

  it('flushes pending deletes', async () => {
    const commit = vi.fn(() => Promise.resolve());
    const queue = createDeleteQueue({ commit });
    queue.schedule('a:1');
    queue.schedule('a:2');
    queue.flush();
    expect(commit).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createDemoData, createMemoryRepository } from '../memory';
import {
  backoffDelay,
  createOutbox,
  OutboxFullError,
  parseStoredOutbox,
  serializeOutbox,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStorage,
} from './outbox';

const offline = () => new TypeError('Network request failed');
const jot: OutboxDraft = { kind: 'jot', body: 'Tea at Ippodo', spaces: [] };
const link: OutboxDraft = { kind: 'link', url: 'https://calmtech.com', title: 'Calm Technology', capturedBy: 'share', spaces: [{ id: 's1', name: 'Reading' }] };

const memoryStorage = (initial: string | null = null) => {
  let value = initial;
  const storage: OutboxStorage & { value: () => string | null } = {
    read: async () => value,
    write: async (next) => {
      value = next;
    },
    value: () => value,
  };
  return storage;
};

/** A clock the test moves by hand. */
const clock = (start = Date.UTC(2026, 10, 1, 12)) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('createOutbox', () => {
  it('keeps a save, persists it, and sends it on flush', async () => {
    const storage = memoryStorage();
    const send = vi.fn(async (item: OutboxItem) => `saved:${item.id}`);
    const outbox = createOutbox({ storage, send });
    outbox.enqueue(jot, { id: 'a', owner: 'u1' });
    await outbox.settled();
    expect(parseStoredOutbox(storage.value())).toMatchObject([{ id: 'a', draft: jot, status: 'waiting', attempts: 0 }]);

    const result = await outbox.flush({ owner: 'u1' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.sent).toEqual([{ item: expect.objectContaining({ id: 'a' }), result: 'saved:a' }]);
    expect(outbox.items()).toEqual([]);
    await outbox.settled();
    expect(parseStoredOutbox(storage.value())).toEqual([]);
  });

  it('survives a restart: a new outbox over the same storage sends what was left', async () => {
    const storage = memoryStorage();
    const first = createOutbox({ storage, send: async () => Promise.reject(offline()) });
    first.enqueue(link, { id: 'l1', owner: 'u1', error: offline() });
    await first.settled();

    const send = vi.fn(async () => 'ok');
    const second = createOutbox({ storage, send });
    await second.load();
    expect(second.items()).toMatchObject([{ id: 'l1', draft: link, attempts: 1, lastError: 'Network request failed' }]);
    await second.flush({ force: true, owner: 'u1' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1', draft: link }));
    expect(second.items()).toEqual([]);
  });

  it('backs off while offline, stops the round at the first offline failure, and retries later', async () => {
    const c = clock();
    let online = false;
    const send = vi.fn(async (item: OutboxItem) => {
      if (!online) throw offline();
      return item.id;
    });
    const outbox = createOutbox({ send, now: c.now, random: () => 0.5 });
    outbox.enqueue(jot, { id: 'a', queuedAt: '2026-11-01T12:00:00.000Z' });
    outbox.enqueue({ kind: 'task', title: 'Pack', spaces: [] }, { id: 'b', queuedAt: '2026-11-01T12:00:01.000Z' });

    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1); // b wasn't tried: offline is offline
    expect(outbox.items().map((i) => [i.id, i.status, i.attempts])).toEqual([
      ['a', 'waiting', 1],
      ['b', 'waiting', 0],
    ]);
    expect(outbox.nextDueAt()).toBe(c.now()); // b is due now; a after its backoff
    const a = outbox.items()[0];
    expect(a.nextAttemptAt - c.now()).toBe(backoffDelay(1, undefined, () => 0.5));

    // Not due yet: an unforced flush skips a (and b fails offline again).
    await outbox.flush();
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);

    online = true;
    c.advance(60_000);
    const result = await outbox.flush();
    expect(result.sent.map((s) => s.item.id)).toEqual(['a', 'b']);
    expect(outbox.items()).toEqual([]);
  });

  it('parks a save the server refused, with the reason, until Retry', async () => {
    let refuse = true;
    const send = vi.fn(async () => {
      if (refuse) throw new Error('new row violates row-level security policy');
      return 'ok';
    });
    const outbox = createOutbox({ send });
    outbox.enqueue(jot, { id: 'a' });
    const result = await outbox.flush({ force: true });
    expect(result.failed).toMatchObject([{ id: 'a', status: 'failed', lastError: 'new row violates row-level security policy' }]);
    await outbox.flush({ force: true });
    expect(send).toHaveBeenCalledTimes(1); // failed items aren't retried automatically

    refuse = false;
    const retried = await outbox.retry('a');
    expect(retried.sent).toHaveLength(1);
    expect(outbox.items()).toEqual([]);
  });

  it('discard drops only the local copy, and Undo puts it back', async () => {
    const send = vi.fn(async () => 'ok');
    const outbox = createOutbox({ send });
    outbox.enqueue(jot, { id: 'a' });
    const removed = outbox.discard('a');
    expect(removed).toMatchObject({ id: 'a' });
    expect(outbox.items()).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    outbox.restore(removed!);
    expect(outbox.items()).toMatchObject([{ id: 'a', status: 'waiting' }]);
  });

  it('won’t discard a save that is being sent', async () => {
    let finish: (value: string) => void = () => {};
    const outbox = createOutbox({ send: () => new Promise<string>((resolve) => (finish = resolve)) });
    outbox.enqueue(jot, { id: 'a' });
    const flushing = outbox.flush();
    await Promise.resolve();
    expect(outbox.items()[0].status).toBe('sending');
    expect(outbox.discard('a')).toBeNull();
    finish('ok');
    await flushing;
    expect(outbox.items()).toEqual([]);
  });

  it('runs one flush at a time; a call during a run gets one more pass', async () => {
    let calls = 0;
    const outbox = createOutbox({ send: async () => (calls += 1) });
    outbox.enqueue(jot, { id: 'a' });
    const first = outbox.flush();
    outbox.enqueue({ kind: 'jot', body: 'second', spaces: [] }, { id: 'b' });
    const second = outbox.flush();
    expect(second).toBe(first);
    const result = await first;
    expect(result.sent.map((s) => s.item.id)).toEqual(['a', 'b']);
    expect(calls).toBe(2);
  });

  it('sends only the signed-in user’s saves', async () => {
    const send = vi.fn(async (item: OutboxItem) => item.id);
    const outbox = createOutbox({ send });
    outbox.enqueue(jot, { id: 'mine', owner: 'u1' });
    outbox.enqueue(jot, { id: 'theirs', owner: 'u2' });
    const result = await outbox.flush({ owner: 'u1' });
    expect(result.sent.map((s) => s.item.id)).toEqual(['mine']);
    expect(outbox.items().map((i) => i.id)).toEqual(['theirs']);
  });

  it('enqueueing the same id twice keeps one copy', () => {
    const outbox = createOutbox({ send: async () => 'ok' });
    const first = outbox.enqueue(jot, { id: 'a' });
    expect(outbox.enqueue({ kind: 'jot', body: 'other', spaces: [] }, { id: 'a' })).toBe(first);
    expect(outbox.items()).toHaveLength(1);
  });

  it('has a limit', () => {
    const outbox = createOutbox({ send: async () => 'ok', limit: 1 });
    outbox.enqueue(jot, { id: 'a' });
    expect(() => outbox.enqueue(jot, { id: 'b' })).toThrow(OutboxFullError);
  });

  it('merges stored items with ones enqueued before loading finished', async () => {
    const storage = memoryStorage(serializeOutbox([{ id: 'old', draft: jot, owner: null, queuedAt: '2026-10-31T09:00:00.000Z', attempts: 2, status: 'sending', nextAttemptAt: 0, lastError: 'x' }]));
    const outbox = createOutbox({ storage, send: async () => 'ok' });
    outbox.enqueue(link, { id: 'new' });
    await outbox.load();
    // Oldest first; a save cut off mid-send is waiting again.
    expect(outbox.items().map((i) => [i.id, i.status])).toEqual([
      ['old', 'waiting'],
      ['new', 'waiting'],
    ]);
  });

  it('a retry after a lost response doesn’t duplicate: the Repository returns the row saved with that id', async () => {
    const repository = createMemoryRepository(createDemoData());
    let loseResponse = true;
    const outbox = createOutbox({
      send: async (item) => {
        if (item.draft.kind !== 'jot') throw new Error('unexpected');
        const row = await repository.jots.create({ id: item.id, profile_id: null, body: item.draft.body });
        if (loseResponse) {
          loseResponse = false;
          throw offline(); // saved on the server, but the phone never heard back
        }
        return row;
      },
    });
    outbox.enqueue(jot, { id: '0b4c2a8e-0000-4000-8000-000000000001' });
    await outbox.flush();
    await outbox.flush({ force: true });
    expect(outbox.items()).toEqual([]);
    expect((await repository.jots.getAll()).filter((j) => j.body === 'Tea at Ippodo')).toHaveLength(1);
  });
});

describe('parseStoredOutbox', () => {
  it('drops what it can’t read, item by item', () => {
    const good: OutboxItem = { id: 'a', draft: jot, owner: 'u1', queuedAt: '2026-11-01T00:00:00.000Z', attempts: 0, status: 'waiting', nextAttemptAt: 0, lastError: null };
    const raw = JSON.stringify({ version: 1, items: [good, { id: 'b', draft: { kind: 'video' } }, { ...good }, 'junk'] });
    expect(parseStoredOutbox(raw)).toEqual([good]);
    expect(parseStoredOutbox('{not json')).toEqual([]);
    expect(parseStoredOutbox(JSON.stringify({ version: 99, items: [good] }))).toEqual([]);
    expect(parseStoredOutbox(null)).toEqual([]);
  });
});

describe('backoffDelay', () => {
  it('doubles from 5 s, capped at 10 minutes, with jitter', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4].map((n) => backoffDelay(n, undefined, mid))).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(backoffDelay(30, undefined, mid)).toBe(600_000);
    expect(backoffDelay(1, undefined, () => 0)).toBe(3_750);
    expect(backoffDelay(1, undefined, () => 1)).toBe(6_250);
  });
});

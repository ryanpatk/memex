import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { parseComposer, parseStoredOutbox, type LinkWithTag, type OutboxStorage, type SelfMessage } from '@memex/core';
import { sequentialIds, withNetwork } from '../testing/network';
import { createJournalActions, type Composed } from './actions';
import { createFixtureRepository } from './fixtures/fixtureRepository';
import { keys } from './keys';
import { createSaves, fromDraft, toDraft } from './saves';

/*
 * Saves with the outbox, on the demo repository behind a network switch:
 * offline saves are kept, sent later through the same compose path, and
 * never duplicated, even when the first try reached the server.
 */

const NOW = new Date(2026, 10, 1, 12, 0);
const SPACES = [
  { id: 'studio', name: 'Studio' },
  { id: 'kyoto', name: 'Kyoto trip' },
];
const compose = (text: string) => parseComposer(text, SPACES) as Composed;

const memoryStorage = () => {
  let value: string | null = null;
  const storage: OutboxStorage & { stored: () => ReturnType<typeof parseStoredOutbox> } = {
    read: async () => value,
    write: async (next) => {
      value = next;
    },
    stored: () => parseStoredOutbox(value),
  };
  return storage;
};

const setup = async () => {
  const net = withNetwork(createFixtureRepository({ now: NOW }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: keys.jots, queryFn: () => net.repository.jots.getAll() }),
    queryClient.prefetchQuery({ queryKey: keys.links, queryFn: () => net.repository.links.getAll() }),
    queryClient.prefetchQuery({ queryKey: keys.taskMembership, queryFn: () => net.repository.spaceTasks.listMembership() }),
  ]);
  const actions = createJournalActions({ queryClient, repository: net.repository, client: 'memex-ios/test', now: () => NOW });
  const storage = memoryStorage();
  const saves = createSaves({ actions, newId: sequentialIds(), storage });
  saves.setOwner('demo-user');
  return { ...net, queryClient, actions, saves, storage };
};

describe('saves', () => {
  it('online, a save goes straight through (created with the id chosen on the phone)', async () => {
    const { saves, repository } = await setup();
    const saved = await saves.save(compose('[test] tea at Ippodo'));
    expect(saved).toMatchObject({ queued: false, outcome: { kind: 'jot', id: '0b4c2a8e-0000-4000-8000-000000000001' } });
    expect((await repository.jots.getAll()).at(-1)).toMatchObject({ id: '0b4c2a8e-0000-4000-8000-000000000001', body: '[test] tea at Ippodo' });
    expect(saves.outbox.items()).toEqual([]);
  });

  it('offline, it’s kept on the phone (stored), not in the feed, and sent when back online', async () => {
    const { saves, setOnline, repository, queryClient, storage } = await setup();
    setOnline(false);
    const saved = await saves.save(compose('[] [test] pack the tripod @Kyoto trip'));
    expect(saved.queued).toBe(true);
    expect(saves.outbox.items()).toMatchObject([
      { status: 'waiting', attempts: 1, owner: 'demo-user', lastError: 'Network request failed', draft: { kind: 'task', title: '[test] pack the tripod', spaces: [{ id: 'kyoto', name: 'Kyoto trip' }] } },
    ]);
    await saves.outbox.settled();
    expect(storage.stored()).toHaveLength(1);
    // The optimistic row was rolled back: the pending row stands for it now.
    expect(queryClient.getQueryData<SelfMessage[]>(keys.tasks) ?? []).toEqual([]);

    // Still offline: a flush keeps it waiting, with one more try counted.
    await saves.flush(true);
    expect(saves.outbox.items()[0]).toMatchObject({ status: 'waiting', attempts: 2 });

    setOnline(true);
    const result = await saves.flush(true);
    expect(result.sent).toHaveLength(1);
    expect(saves.outbox.items()).toEqual([]);
    const task = (await repository.tasks.getAll()).find((t) => t.title === '[test] pack the tripod');
    expect(task?.id).toBe(saved.queued ? saved.item.id : '');
    // Filed where it was asked, and written at the time it was first tried.
    expect((await repository.spaceTasks.listMembership()).filter((r) => r.task_id === task?.id).map((r) => r.profile_id)).toEqual(['kyoto']);
    expect(task?.created_at).toBe(saved.queued ? saved.item.queuedAt : '');
  });

  it('a jot that reached the server before the connection dropped isn’t saved twice', async () => {
    const { saves, loseNextResponse, repository } = await setup();
    loseNextResponse();
    const saved = await saves.save(compose('[test] the moss garden at Saihō-ji'));
    expect(saved.queued).toBe(true);
    await saves.flush(true);
    expect(saves.outbox.items()).toEqual([]);
    expect((await repository.jots.getAll()).filter((j) => j.body === '[test] the moss garden at Saihō-ji')).toHaveLength(1);
  });

  it('a link that reached the server isn’t saved twice either (the retry finds it on the server)', async () => {
    const { saves, loseNextResponse, repository, queryClient } = await setup();
    const before = (await repository.links.getAll()).length;
    loseNextResponse();
    const saved = await saves.save({ kind: 'link', url: 'https://calmtech.com/test-share', title: '[test] Calm Technology', capturedBy: 'share', spaces: [] });
    expect(saved.queued).toBe(true);
    // The cache doesn't know about it (rolled back), so only the server can say it exists.
    expect(queryClient.getQueryData<LinkWithTag[]>(keys.links)!.some((l) => l.url.includes('test-share'))).toBe(false);
    const result = await saves.flush(true);
    expect(result.sent[0]?.result).toMatchObject({ kind: 'link', duplicate: true });
    const links = (await repository.links.getAll()).filter((l) => l.url === 'https://calmtech.com/test-share');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ title: '[test] Calm Technology', captured_by: 'share', captured_client: 'memex-ios/test' });
    expect(await repository.links.getAll()).toHaveLength(before + 1);
  });

  it('a save the server refuses still fails (nothing is kept)', async () => {
    const { saves, repository } = await setup();
    repository.jots.create = async () => {
      throw new Error('new row violates row-level security policy');
    };
    await expect(saves.save(compose('[test] nope'))).rejects.toThrow('row-level security');
    expect(saves.outbox.items()).toEqual([]);
  });

  it('only sends for the signed-in user, and nothing while signed out', async () => {
    const { saves, setOnline, calls } = await setup();
    setOnline(false);
    await saves.save(compose('[test] mine'));
    setOnline(true);
    saves.setOwner(null);
    calls.length = 0;
    expect(await saves.flush(true)).toEqual({ sent: [], failed: [], waiting: 0 });
    expect(calls).toEqual([]);
    saves.setOwner('someone-else');
    expect((await saves.flush(true)).sent).toEqual([]);
    saves.setOwner('demo-user');
    expect((await saves.flush(true)).sent).toHaveLength(1);
  });

  it('discard drops only the copy on the phone', async () => {
    const { saves, setOnline, calls } = await setup();
    setOnline(false);
    const saved = await saves.save(compose('[test] never mind'));
    if (!saved.queued) throw new Error('expected a queued save');
    calls.length = 0;
    expect(saves.discard(saved.item.id)).toMatchObject({ id: saved.item.id });
    expect(saves.outbox.items()).toEqual([]);
    expect(calls).toEqual([]); // nothing was asked of the server
  });
});

describe('toDraft / fromDraft', () => {
  it('round-trip every kind, links with what the share sheet knew', () => {
    const results: Composed[] = [
      compose('[test] a jot @Studio'),
      compose('[] [test] a task @Kyoto trip'),
      parseComposer('[test] Title\nbody', SPACES, true) as Composed,
      { kind: 'link', url: 'https://example.com', title: 'Example', note: 'why', capturedBy: 'share', spaces: [{ id: 'studio', name: 'Studio' }] },
    ];
    results.forEach((result) => expect(fromDraft(toDraft(result))).toMatchObject(result));
    expect(toDraft(compose('https://example.com'))).toEqual({ kind: 'link', url: 'https://example.com', spaces: [] });
  });
});

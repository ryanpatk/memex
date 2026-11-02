import { describe, expect, it } from 'vitest';
import { buildDemoData } from './fixtures/demoData';
import { createFixtureRepository } from './fixtures/fixtureRepository';
import { spaceFeed, summarizeSpaces, toJournal } from './journal';

const NOW = new Date(2026, 10, 1, 12, 0);

describe('toJournal on the demo data', () => {
  const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);

  it('puts every row in the feed, newest first, with day separators', () => {
    const data = buildDemoData(NOW);
    const total = data.jots.length + data.links.length + data.notes.length + data.tasks.length;
    expect(journal.entries).toHaveLength(total);
    const days = journal.feed.filter((p) => p.kind === 'day').map((p) => (p.kind === 'day' ? p.label : ''));
    expect(days[0]).toBe('Today');
    expect(days[1]).toBe('Yesterday');
    const times = journal.feed.map((p) => p.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('folds back-to-back platform saves into runs', () => {
    const runs = journal.feed.filter((p) => p.kind === 'run');
    expect(runs.map((r) => (r.kind === 'run' ? [r.source.key, r.entries.length] : null))).toEqual([
      ['x', 3],
      ['pinterest', 5],
    ]);
  });

  it('gives spaces hex colours and counts', () => {
    expect(journal.spaces.map((s) => s.name)).toEqual(['Studio', 'Kyoto trip', 'Reading', 'Home']);
    journal.spaces.forEach((s) => expect(s.color).toMatch(/^#[0-9a-f]{6}$/));
    expect(journal.perSpace.get('kyoto')).toBe(4);
    expect(journal.counts).toEqual({ jot: 5, link: 24, note: 2, task: 8 });
    expect(Object.fromEntries(journal.openTasks)).toEqual({ kyoto: 2, studio: 2, home: 1, unfiled: 1 });
  });

  it('leaves dismissed suggestions out of the Inbox and the filer', () => {
    expect(journal.inbox.map((x) => x.entry.id)).toContain('link:l3');
    const l3 = journal.entries.find((e) => e.id === 'link:l3')!;
    expect(journal.filer.suggest(l3)?.space.name).toBe('Reading');
    const dismissed = toJournal(buildDemoData(NOW), '#5077ff', NOW, new Set(['link:l3']));
    expect(dismissed.inbox.map((x) => x.entry.id)).not.toContain('link:l3');
    expect(dismissed.inbox).toHaveLength(journal.inbox.length - 1);
    expect(dismissed.filer.suggest(l3)).toBeUndefined();
  });
});

describe('spaces', () => {
  const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);

  it('summarizes each space: counts, open tasks, newest entries first', () => {
    const [studio, kyoto, reading, home] = summarizeSpaces(journal);
    expect(studio).toMatchObject({ count: 7, openTasks: 2 });
    expect(studio.recent.map((e) => e.id)).toEqual(['task:t6', 'note:n2', 'link:x0']);
    expect(kyoto).toMatchObject({ count: 4, openTasks: 2 });
    expect(reading).toMatchObject({ count: 3, openTasks: 0 });
    expect(reading.recent[0].id).toBe('jot:j3');
    expect(home.lastAt).toBe(journal.entries.find((e) => e.id === 'task:t7')!.at);
    expect(summarizeSpaces(journal, 1).every((s) => s.recent.length === 1)).toBe(true);
  });

  it('builds a space’s own feed from core’s model', () => {
    const { entries, feed, counts } = spaceFeed(journal, 'kyoto', NOW);
    expect(entries.map((e) => e.id).sort()).toEqual(['note:n1', 'task:t1', 'task:t3', 'task:t4']);
    expect(counts).toEqual({ jot: 0, link: 0, note: 1, task: 3 });
    expect(feed[0]).toMatchObject({ kind: 'task', id: 'task:t3' });
    expect(feed.filter((p) => p.kind === 'day').map((p) => (p.kind === 'day' ? p.label : ''))[0]).toBe('Today');
    expect(spaceFeed(journal, 'nope', NOW).feed).toEqual([]);
  });

  it('carries core’s board: pins, open and done tasks, total', () => {
    const { board } = spaceFeed(journal, 'kyoto', NOW);
    expect(board.openTasks.map((t) => t.id)).toEqual(['t4', 't3']);
    expect(board.doneTasks.map((t) => t.id)).toEqual(['t1']);
    expect(board.total).toBe(4);
    expect(spaceFeed(journal, 'reading', NOW).board.pinned.map((l) => l.id)).toEqual(['l2', 'l1']);
  });
});

describe('createFixtureRepository', () => {
  it('reads demo rows, keeps writes in memory, and signs in and out', async () => {
    const repo = createFixtureRepository({ signedIn: false, now: NOW });
    expect(await repo.auth.getSession()).toBeNull();
    const seen: unknown[] = [];
    repo.auth.onAuthStateChange((s) => seen.push(s?.user.id ?? null));
    await repo.auth.signInWithPassword({ email: 'a@b.c', password: 'x' });
    await repo.auth.signOut();
    expect(seen).toEqual(['demo-user', null]);
    expect((await repo.links.getAll()).length).toBeGreaterThan(0);
    const jot = await repo.jots.create({ body: '[test] jot', profile_id: 'kyoto' });
    expect((await repo.jots.getAll()).at(-1)).toMatchObject({ id: jot.id, body: '[test] jot', profile_id: 'kyoto' });
    await repo.jots.delete(jot.id);
    expect((await repo.jots.getAll()).some((j) => j.id === jot.id)).toBe(false);
    // A fresh repository starts from the demo data again: nothing persists.
    expect((await createFixtureRepository({ now: NOW }).jots.getAll()).length).toBe(buildDemoData(NOW).jots.length);
  });
});

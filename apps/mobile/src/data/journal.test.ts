import { describe, expect, it } from 'vitest';
import { buildDemoData } from './fixtures/demoData';
import { createFixtureRepository } from './fixtures/fixtureRepository';
import { toJournal } from './journal';

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
    expect(journal.perSpace.get('kyoto')).toBe(3);
    expect(journal.counts).toEqual({ jot: 5, link: 24, note: 2, task: 3 });
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

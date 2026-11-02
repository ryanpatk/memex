import { describe, expect, it } from 'vitest';
import { buildStreamItems } from '../stream/items';
import { BUILT_IN_VIEWS, countMatching, savedViewsToTabs, spaceIdsByItem } from '../stream/views';
import { createDemoData } from './demoData';
import { createMemoryRepository } from './repository';

describe('memory repository', () => {
  it('starts signed in, or signed out when asked', async () => {
    expect((await createMemoryRepository(createDemoData()).auth.getSession())?.user.id).toBe('demo-user');
    expect(await createMemoryRepository(createDemoData(), { signedOut: true }).auth.getSession()).toBeNull();
  });

  it('notifies sign-out', async () => {
    const repo = createMemoryRepository(createDemoData());
    const seen: unknown[] = [];
    repo.auth.onAuthStateChange((session) => seen.push(session));
    await repo.auth.signOut();
    expect(seen).toEqual([null]);
  });

  it('creates, updates and deletes saved views', async () => {
    const repo = createMemoryRepository(createDemoData());
    const before = await repo.views.getAll();
    const created = await repo.views.create({ name: '[test] view', definition: { filters: { types: ['note'] } }, position: 9 });
    await repo.views.update(created.id, { name: 'Renamed' });
    const after = await repo.views.getAll();
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].name).toBe('Renamed');
    await repo.views.delete(created.id);
    expect(await repo.views.getAll()).toHaveLength(before.length);
  });

  it('keeps a task’s due date unless an update sets or clears it', async () => {
    const repo = createMemoryRepository(createDemoData());
    const dated = (await repo.tasks.getAll()).find((t) => t.due_date)!;
    await repo.tasks.update(dated.id, { title: 'Renamed', is_done: true });
    expect((await repo.tasks.getAll()).find((t) => t.id === dated.id)?.due_date).toBe(dated.due_date);
    await repo.tasks.update(dated.id, { due_date: null });
    expect((await repo.tasks.getAll()).find((t) => t.id === dated.id)?.due_date).toBeUndefined();
  });

  it('edits a jot and moves it between spaces', async () => {
    const repo = createMemoryRepository(createDemoData());
    const [space] = await repo.spaces.getAll();
    const created = await repo.jots.create({ body: '[test] jot', profile_id: null });
    const edited = await repo.jots.update(created.id, { body: '[test] jot, edited' });
    expect(edited).toMatchObject({ body: '[test] jot, edited', profile_id: null });
    const moved = await repo.jots.update(created.id, { profile_id: space.id });
    expect(moved).toMatchObject({ body: '[test] jot, edited', profile_id: space.id });
    const out = await repo.jots.update(created.id, { profile_id: null });
    expect(out.profile_id).toBeNull();
    expect((await repo.jots.getAll()).find((j) => j.id === created.id)).toMatchObject({ body: '[test] jot, edited', profile_id: null });
    await expect(repo.jots.update('missing', { body: 'x' })).rejects.toThrow();
  });

  it('returns copies, never the store itself', async () => {
    const repo = createMemoryRepository(createDemoData());
    const [first] = await repo.links.getAll();
    first.title = 'mutated';
    expect((await repo.links.getById(first.id))?.title).not.toBe('mutated');
  });

  it('keeps tags and membership on items', async () => {
    const repo = createMemoryRepository(createDemoData());
    const link = (await repo.links.getAll()).find((l) => l.id === 'ln-1');
    expect(link?.link_tags?.map((j) => j.tag?.name)).toEqual(['inspiration']);
    await repo.links.delete('ln-1');
    expect((await repo.spaceLinks.listMembership()).some((row) => row.link_id === 'ln-1')).toBe(false);
  });

  it('gives every built-in view something to show', async () => {
    const repo = createMemoryRepository(createDemoData());
    const items = buildStreamItems(await repo.links.getAll(), await repo.notes.getAll(), await repo.tasks.getAll());
    const spaces = spaceIdsByItem({
      links: await repo.spaceLinks.listMembership(),
      notes: await repo.spaceNotes.listMembership(),
      tasks: await repo.spaceTasks.listMembership(),
    });
    const context = { spacesOf: (key: string) => spaces.get(key) ?? [] };
    BUILT_IN_VIEWS.forEach((view) => expect(countMatching(items, view.definition.filters, context)).toBeGreaterThan(0));
    savedViewsToTabs(await repo.views.getAll()).forEach((view) =>
      expect(countMatching(items, view.definition.filters, context)).toBeGreaterThan(0),
    );
  });
});

describe('memory repository: creates with a client-chosen id', () => {
  it('uses the id, and a second create with it returns the first row', async () => {
    const repo = createMemoryRepository(createDemoData());
    const id = '7d1f9a64-2b9e-4c1a-9a51-3f0c2d9e8b11';
    const jot = await repo.jots.create({ id, profile_id: null, body: '[test] once' });
    const again = await repo.jots.create({ id, profile_id: null, body: '[test] once' });
    expect(jot.id).toBe(id);
    expect(again).toEqual(jot);
    expect((await repo.jots.getAll()).filter((j) => j.id === id)).toHaveLength(1);

    const task = await repo.tasks.create({ id: `${id.slice(0, -1)}2`, title: '[test] task' });
    await repo.tasks.create({ id: task.id, title: '[test] task' });
    expect((await repo.tasks.getAll()).filter((t) => t.id === task.id)).toHaveLength(1);

    const note = await repo.notes.create({ id: `${id.slice(0, -1)}3`, title: '[test] note', body: 'x' });
    await repo.notes.create({ id: note.id, title: '[test] note', body: 'x' });
    expect((await repo.notes.getAll()).filter((n) => n.id === note.id)).toHaveLength(1);
  });
});

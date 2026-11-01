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

import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { parseComposer, type InboxProposal, type LinkWithTag, type NoteWithTags, type Repository, type SelfMessage, type TaskWithTags } from '@memex/core';
import { createFixtureRepository } from './fixtures/fixtureRepository';
import { createJournalActions, faviconFor, parseEntryId, type Composed } from './actions';
import { keys } from './keys';

const NOW = new Date(2026, 10, 1, 12, 0);
const SPACES = [
  { id: 'studio', name: 'Studio' },
  { id: 'kyoto', name: 'Kyoto trip' },
];

/** A query client primed from the repository, as the screens would have it. */
const setup = async (repository: Repository = createFixtureRepository({ now: NOW })) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const prime = (key: readonly string[], fn: () => Promise<unknown>) => queryClient.prefetchQuery({ queryKey: key, queryFn: fn });
  await Promise.all([
    prime(keys.jots, () => repository.jots.getAll()),
    prime(keys.links, () => repository.links.getAll()),
    prime(keys.notes, () => repository.notes.getAll()),
    prime(keys.tasks, () => repository.tasks.getAll()),
    prime(keys.linkMembership, () => repository.spaceLinks.listMembership()),
    prime(keys.noteMembership, () => repository.spaceNotes.listMembership()),
    prime(keys.taskMembership, () => repository.spaceTasks.listMembership()),
    prime(keys.proposals, () => repository.proposals.getPending()),
  ]);
  const enrich = vi.fn(async () => ({ title: '[test] Scraped title', image: 'https://img.test/a.jpg' }));
  const actions = createJournalActions({ queryClient, repository, client: 'memex-ios/test', enrich, now: () => NOW });
  return { queryClient, repository, actions, enrich };
};

const compose = (text: string, asNote = false) => parseComposer(text, SPACES, asNote) as Composed;

describe('compose', () => {
  it('saves a jot in its first @space, showing it before the Repository answers', async () => {
    const base = createFixtureRepository({ now: NOW });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: Repository = { ...base, jots: { ...base.jots, create: async (data) => (await gate, base.jots.create(data)) } };
    const { queryClient, repository, actions } = await setup(slow);
    const pending = actions.compose(compose('[test] tea at Ippodo @Kyoto trip'));
    await vi.waitFor(() => expect(queryClient.getQueryData<SelfMessage[]>(keys.jots)!.at(-1)!.id).toMatch(/^temp-/));
    const optimistic = queryClient.getQueryData<SelfMessage[]>(keys.jots)!.at(-1)!;
    expect(optimistic).toMatchObject({ body: '[test] tea at Ippodo', profile_id: 'kyoto' });
    release();
    const outcome = await pending;
    expect(outcome.kind).toBe('jot');
    expect((await repository.jots.getAll()).at(-1)).toMatchObject({ id: outcome.id, profile_id: 'kyoto' });
    expect(queryClient.getQueryData<SelfMessage[]>(keys.jots)!.some((j) => j.id.startsWith('temp-'))).toBe(false);
  });

  it('adds a task and files it in every @space', async () => {
    const { repository, actions, queryClient } = await setup();
    const outcome = await actions.compose(compose('[] [test] pack the tripod @Kyoto trip @Studio'));
    expect(outcome).toMatchObject({ kind: 'task' });
    expect((await repository.tasks.getAll()).find((t) => t.id === outcome.id)?.title).toBe('[test] pack the tripod');
    const filed = (await repository.spaceTasks.listMembership()).filter((r) => r.task_id === outcome.id).map((r) => r.profile_id);
    expect(filed.sort()).toEqual(['kyoto', 'studio']);
    const cached = queryClient.getQueryData<{ task_id: string }[]>(keys.taskMembership)!;
    expect(cached.filter((r) => r.task_id === outcome.id)).toHaveLength(2);
  });

  it('saves a note (first line is the title)', async () => {
    const { repository, actions } = await setup();
    const outcome = await actions.compose(compose('[test] Packing list\n- tripod\n- film', true));
    const note = (await repository.notes.getAll()).find((n) => n.id === outcome.id);
    expect(note).toMatchObject({ title: '[test] Packing list', body: '[test] Packing list\n- tripod\n- film' });
  });

  it('captures a link from the app, enriched by the scraper', async () => {
    const { repository, actions, enrich } = await setup();
    const outcome = await actions.compose(compose('https://example.org/[test]-essay @Studio'));
    expect(outcome).toMatchObject({ kind: 'link', duplicate: false });
    expect(enrich).toHaveBeenCalledOnce();
    const row = await repository.links.getById(outcome.id);
    expect(row).toMatchObject({
      title: '[test] Scraped title',
      preview_image_url: 'https://img.test/a.jpg',
      favicon_url: faviconFor('https://example.org/'),
      captured_by: 'app',
      captured_client: 'memex-ios/test',
      source: 'web',
    });
    expect((await repository.spaceLinks.listMembership()).some((r) => r.link_id === outcome.id && r.profile_id === 'studio')).toBe(true);
  });

  it('finds an already-saved link instead of saving it twice, and still files it', async () => {
    const { repository, actions, queryClient } = await setup();
    const before = (await repository.links.getAll()).length;
    const outcome = await actions.compose(compose('calmtech.com @Kyoto trip'));
    expect(outcome).toMatchObject({ kind: 'link', id: 'l2', duplicate: true });
    expect(await repository.links.getAll()).toHaveLength(before);
    expect(queryClient.getQueryData<LinkWithTag[]>(keys.links)!.some((l) => l.id.startsWith('temp-'))).toBe(false);
    expect((await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'l2' && r.profile_id === 'kyoto')).toBe(true);
  });

  it('rolls the optimistic row back when the save fails', async () => {
    const base = createFixtureRepository({ now: NOW });
    const failing: Repository = { ...base, tasks: { ...base.tasks, create: () => Promise.reject(new Error('offline')) } };
    const { queryClient, actions } = await setup(failing);
    const before = queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.length;
    await expect(actions.compose(compose('[] [test] will fail @Studio'))).rejects.toThrow('offline');
    expect(queryClient.getQueryData<TaskWithTags[]>(keys.tasks)).toHaveLength(before);
    expect(queryClient.getQueryData<{ task_id: string }[]>(keys.taskMembership)!.some((r) => r.task_id.startsWith('temp-'))).toBe(false);
  });

  it('keeps the item when only the filing fails, and says which spaces', async () => {
    const base = createFixtureRepository({ now: NOW });
    const failing: Repository = { ...base, spaceTasks: { ...base.spaceTasks, addTasks: () => Promise.reject(new Error('nope')) } };
    const { actions, repository } = await setup(failing);
    const outcome = await actions.compose(compose('[] [test] half saved @Studio'));
    expect(outcome.unfiled).toEqual(['studio']);
    expect((await repository.tasks.getAll()).some((t) => t.id === outcome.id)).toBe(true);
  });
});

describe('task, filing and delete actions', () => {
  it('ticks a task optimistically and rolls back on failure', async () => {
    const base = createFixtureRepository({ now: NOW });
    let fail = false;
    const repo: Repository = {
      ...base,
      tasks: { ...base.tasks, update: (id, u) => (fail ? Promise.reject(new Error('x')) : base.tasks.update(id, u)) },
    };
    const { queryClient, actions, repository } = await setup(repo);
    const task = queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't2')!;
    await actions.setTaskDone(task, true);
    expect((await repository.tasks.getAll()).find((t) => t.id === 't2')?.is_done).toBe(true);
    fail = true;
    await expect(actions.setTaskDone(task, false)).rejects.toThrow();
    expect(queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't2')?.is_done).toBe(true);
  });

  it('files and unfiles an item', async () => {
    const { actions, repository } = await setup();
    await actions.file('link', 'l3', 'reading');
    await actions.file('link', 'l3', 'reading');
    expect((await repository.spaceLinks.listMembership()).filter((r) => r.link_id === 'l3')).toEqual([{ profile_id: 'reading', link_id: 'l3' }]);
    await actions.unfile('link', 'l3', 'reading');
    expect((await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'l3')).toBe(false);
  });

  it('deletes each kind of entry and its filing', async () => {
    const { actions, repository, queryClient } = await setup();
    await actions.remove('task', 't2');
    await actions.remove('jot', 'j1');
    await actions.remove('link', 'p0');
    expect((await repository.tasks.getAll()).some((t) => t.id === 't2')).toBe(false);
    expect((await repository.jots.getAll()).some((j) => j.id === 'j1')).toBe(false);
    expect((await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'p0')).toBe(false);
    expect(queryClient.getQueryData<LinkWithTag[]>(keys.links)!.some((l) => l.id === 'p0')).toBe(false);
  });

  it('parses entry ids', () => {
    expect(parseEntryId('link:abc:1')).toEqual({ kind: 'link', id: 'abc:1' });
  });
});

describe('Tasks and note writes', () => {
  it('sets and clears a due date, rolling back on failure', async () => {
    const base = createFixtureRepository({ now: NOW });
    let fail = false;
    const repo: Repository = {
      ...base,
      tasks: { ...base.tasks, update: (id, u) => (fail ? Promise.reject(new Error('x')) : base.tasks.update(id, u)) },
    };
    const { queryClient, actions, repository } = await setup(repo);
    const cached = () => queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't3')!;
    await actions.setTaskDue(cached(), '2026-11-06');
    expect(cached().due_date).toBe('2026-11-06');
    expect((await repository.tasks.getAll()).find((t) => t.id === 't3')?.due_date).toBe('2026-11-06');
    fail = true;
    await expect(actions.setTaskDue(cached(), null)).rejects.toThrow();
    expect(cached().due_date).toBe('2026-11-06');
    fail = false;
    await actions.setTaskDue(cached(), null);
    expect((await repository.tasks.getAll()).find((t) => t.id === 't3')?.due_date).toBeUndefined();
  });

  it('moves a ticked task’s updated_at so it sorts first in Done', async () => {
    const { queryClient, actions } = await setup();
    const task = queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't3')!;
    await actions.setTaskDone(task, true);
    expect(queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't3')?.updated_at).not.toBe(task.updated_at);
  });

  it('renames a task (one line, trimmed) and ignores empty or unchanged titles', async () => {
    const { queryClient, actions, repository } = await setup();
    const task = queryClient.getQueryData<TaskWithTags[]>(keys.tasks)!.find((t) => t.id === 't3')!;
    const update = vi.spyOn(repository.tasks, 'update');
    await actions.renameTask(task, '   ');
    await actions.renameTask(task, task.title);
    expect(update).not.toHaveBeenCalled();
    await actions.renameTask(task, '  [test] Renew\n passport  ');
    expect((await repository.tasks.getAll()).find((t) => t.id === 't3')?.title).toBe('[test] Renew passport');
  });

  it('saves a note’s title and markdown, storing an empty title as null', async () => {
    const { queryClient, actions, repository } = await setup();
    const note = queryClient.getQueryData<NoteWithTags[]>(keys.notes)!.find((n) => n.id === 'n2')!;
    const update = vi.spyOn(repository.notes, 'update');
    await actions.updateNote(note, { title: '[test] Case study', body: '## Problem\nScattered capture.' });
    expect(update).toHaveBeenLastCalledWith('n2', { title: '[test] Case study', body: '## Problem\nScattered capture.' });
    expect(queryClient.getQueryData<NoteWithTags[]>(keys.notes)!.find((n) => n.id === 'n2')).toMatchObject({ title: '[test] Case study' });
    await actions.updateNote(note, { title: '  ', body: '[test] body only' });
    expect(update).toHaveBeenLastCalledWith('n2', { title: null, body: '[test] body only' });
  });

  it('rolls a note back when the save fails', async () => {
    const base = createFixtureRepository({ now: NOW });
    const repo: Repository = { ...base, notes: { ...base.notes, update: () => Promise.reject(new Error('offline')) } };
    const { queryClient, actions } = await setup(repo);
    const note = queryClient.getQueryData<NoteWithTags[]>(keys.notes)!.find((n) => n.id === 'n2')!;
    await expect(actions.updateNote(note, { title: 'x', body: 'y' })).rejects.toThrow('offline');
    expect(queryClient.getQueryData<NoteWithTags[]>(keys.notes)!.find((n) => n.id === 'n2')).toMatchObject({ title: note.title, body: note.body });
  });
});

describe('agent proposals', () => {
  const pending = (queryClient: QueryClient) => queryClient.getQueryData<InboxProposal[]>(keys.proposals)!.map((p) => p.id);

  it('approves through core’s applyProposal: files the link and marks it applied', async () => {
    const { queryClient, actions, repository } = await setup();
    const proposal = queryClient.getQueryData<InboxProposal[]>(keys.proposals)!.find((p) => p.id === 'pr1')!;
    const link = (await repository.links.getById('o5'))!;
    await actions.decideProposal(proposal, { type: 'link', item: link }, 'apply');
    expect(pending(queryClient)).toEqual(['pr2', 'pr3']);
    expect((await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'o5' && r.profile_id === 'studio')).toBe(true);
    expect((await repository.proposals.getPending()).map((p) => p.id)).toEqual(['pr2', 'pr3']);
  });

  it('approves an append onto the note as it is now', async () => {
    const { queryClient, actions, repository } = await setup();
    const proposal = queryClient.getQueryData<InboxProposal[]>(keys.proposals)!.find((p) => p.id === 'pr2')!;
    const note = queryClient.getQueryData<NoteWithTags[]>(keys.notes)!.find((n) => n.id === 'n1')!;
    await actions.decideProposal(proposal, { type: 'note', item: note }, 'apply');
    expect((await repository.notes.getAll()).find((n) => n.id === 'n1')?.body).toMatch(/tea in Okazaki\.\n\n## Day 3\nNara/);
  });

  it('rejects without touching the item', async () => {
    const { queryClient, actions, repository } = await setup();
    const proposal = queryClient.getQueryData<InboxProposal[]>(keys.proposals)!.find((p) => p.id === 'pr3')!;
    const before = (await repository.tasks.getAll()).find((t) => t.id === 't2');
    await actions.decideProposal(proposal, null, 'reject');
    expect(pending(queryClient)).toEqual(['pr1', 'pr2']);
    expect((await repository.tasks.getAll()).find((t) => t.id === 't2')).toEqual(before);
  });

  it('puts the proposal back when approving fails (the item is gone)', async () => {
    const { queryClient, actions } = await setup();
    const proposal = queryClient.getQueryData<InboxProposal[]>(keys.proposals)!.find((p) => p.id === 'pr1')!;
    await expect(actions.decideProposal(proposal, null, 'apply')).rejects.toThrow('no longer exists');
    expect(pending(queryClient)).toEqual(['pr1', 'pr2', 'pr3']);
  });
});

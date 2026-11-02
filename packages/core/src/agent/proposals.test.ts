import { describe, expect, it } from 'vitest';
import { createDemoData, createMemoryRepository } from '../memory';
import type { InboxProposal } from '../types';
import { markdownImages } from './images';
import { applyProposal, changedSinceProposed, compactDiff, lineDiff, proposalFields, rejectProposal, type ProposalTarget } from './proposals';

const NOW = Date.parse('2026-11-01T12:00:00Z');

async function setup() {
  const repo = createMemoryRepository(createDemoData(NOW));
  const pending = await repo.proposals.getPending();
  const byId = (id: string) => pending.find((p) => p.id === id)!;
  const target = async (p: InboxProposal): Promise<ProposalTarget | null> => {
    if (p.item_type === 'note') {
      const item = (await repo.notes.getAll()).find((n) => n.id === p.item_id);
      return item ? { type: 'note', item } : null;
    }
    if (p.item_type === 'task') {
      const item = (await repo.tasks.getAll()).find((t) => t.id === p.item_id);
      return item ? { type: 'task', item } : null;
    }
    const item = (await repo.links.getAll()).find((l) => l.id === p.item_id);
    return item ? { type: 'link', item } : null;
  };
  return { repo, pending, byId, target };
}

describe('lineDiff', () => {
  it('marks added, removed and unchanged lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'B' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
    expect(lineDiff('', 'x')).toEqual([{ op: 'add', text: 'x' }]);
    expect(lineDiff('x', '')).toEqual([{ op: 'del', text: 'x' }]);
  });

  it('stays cheap on long texts', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const lines = lineDiff(big, `${big}\nnew`);
    expect(lines.filter((l) => l.op !== 'same')).toEqual([{ op: 'add', text: 'new' }]);
    const compact = compactDiff(lines, 1);
    expect(compact).toEqual([{ op: 'skip', count: 4999 }, { op: 'same', text: 'line 4999' }, { op: 'add', text: 'new' }]);
  });
});

describe('proposals', () => {
  it('describes each kind against the item as it is now', async () => {
    const { byId, target } = await setup();
    const file = byId('pr-1');
    expect(proposalFields(file, (await target(file))!)).toEqual([]);

    const append = byId('pr-2');
    const [text] = proposalFields(append, (await target(append))!);
    expect(text.field).toBe('text');
    expect(text.field === 'text' && text.lines.filter((l) => l.op === 'add').map((l) => l.text)).toEqual(['', '- Soffit: 30 cm drop above the window (from the builder’s email)']);

    const edit = byId('pr-3');
    const fields = proposalFields(edit, (await target(edit))!);
    expect(fields.map((f) => f.field)).toEqual(['title', 'due_date']);
    expect(fields[1]).toMatchObject({ before: 'none' });
  });

  it('approving a file proposal files the item and marks it applied', async () => {
    const { repo, byId, target } = await setup();
    const p = byId('pr-1');
    await applyProposal(repo, p, await target(p));
    expect((await repo.spaceLinks.listMembership()).some((m) => m.profile_id === 'sp-reading' && m.link_id === 'ln-14')).toBe(true);
    expect((await repo.proposals.getPending()).map((x) => x.id)).not.toContain('pr-1');
  });

  it('approving an append adds the text to the note’s current body', async () => {
    const { repo, byId, target } = await setup();
    const p = byId('pr-2');
    const before = (await repo.notes.getAll()).find((n) => n.id === 'nt-1')!.body;
    await applyProposal(repo, p, await target(p));
    const after = (await repo.notes.getAll()).find((n) => n.id === 'nt-1')!.body;
    expect(after).toBe(`${before}\n\n- Soffit: 30 cm drop above the window (from the builder’s email)`);
  });

  it('approving an edit updates only the proposed fields', async () => {
    const { repo, byId, target } = await setup();
    const p = byId('pr-3');
    await applyProposal(repo, p, await target(p));
    const task = (await repo.tasks.getAll()).find((t) => t.id === 'tk-4')!;
    expect(task.title).toBe('Call the electrician about the island outlet and the pendant circuit');
    expect(task.due_date).toBe(p.changes.due_date);
    expect(task.is_done).toBe(false);
  });

  it('rejecting leaves the item alone and keeps the proposal, decided', async () => {
    const { repo, byId } = await setup();
    const p = byId('pr-3');
    await rejectProposal(repo, p);
    expect((await repo.tasks.getAll()).find((t) => t.id === 'tk-4')!.title).toBe('Call the electrician about the island outlet');
    expect((await repo.proposals.getPending()).map((x) => x.id)).toEqual(['pr-1', 'pr-2']);
    await expect(repo.proposals.decide('pr-3', 'applied')).rejects.toThrow(/already decided/);
  });

  it('refuses to apply when the item is gone or already decided', async () => {
    const { repo, byId } = await setup();
    const p = byId('pr-2');
    await expect(applyProposal(repo, p, null)).rejects.toThrow(/no longer exists/);
    await expect(applyProposal(repo, { ...p, status: 'applied' }, null)).rejects.toThrow(/already decided/);
    expect((await repo.proposals.getPending()).map((x) => x.id)).toContain('pr-2');
  });

  it('notices an item edited after the proposal', async () => {
    const { byId, target } = await setup();
    const p = byId('pr-2');
    const t = (await target(p))!;
    expect(changedSinceProposed({ ...p, base_updated_at: t.item.updated_at }, t)).toBe(false);
    expect(changedSinceProposed({ ...p, base_updated_at: '2020-01-01T00:00:00Z' }, t)).toBe(true);
  });
});

describe('markdownImages', () => {
  it('finds http(s) images, skips data: URIs and duplicates', () => {
    const md = '![front](https://a.example/1.jpg) text ![](data:image/png;base64,AAAA) ![x](<https://a.example/2.png> "t") ![again](https://a.example/1.jpg)';
    expect(markdownImages(md)).toEqual([
      { url: 'https://a.example/1.jpg', alt: 'front', kind: 'embedded' },
      { url: 'https://a.example/2.png', alt: 'x', kind: 'embedded' },
    ]);
  });
});
